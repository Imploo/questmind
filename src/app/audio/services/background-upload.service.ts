import { Injectable, inject, NgZone } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { FirebaseService } from '../../core/firebase.service';
import * as logger from '../../shared/logger';

interface SignedUploadUrlResponse {
  signedUrl: string;
  storagePath: string;
  storageUrl: string;
}

interface UploadMetadata {
  campaignId: string;
  sessionId: string;
  storagePath: string;
  transcriptionMode: 'fast' | 'batch';
  audioFileName: string;
  userCorrections?: string;
  finalizeUrl: string;
}

const FINALIZE_URL =
  'https://europe-west1-questmind-dnd.cloudfunctions.net/finalizeUpload';

@Injectable({ providedIn: 'root' })
export class BackgroundUploadService {
  private firebase = inject(FirebaseService);
  private ngZone = inject(NgZone);
  private messageHandler: ((event: MessageEvent) => void) | null = null;

  /**
   * Whether the Background Fetch API is available in this browser.
   */
  isSupported(): boolean {
    return (
      'serviceWorker' in navigator &&
      'BackgroundFetchManager' in window
    );
  }

  /**
   * Attempt a background upload via the Background Fetch API.
   *
   * Steps:
   * 1. Request a signed upload URL from the backend
   * 2. Send upload metadata to the service worker via MessageChannel
   * 3. Register a Background Fetch with a PUT request to the signed URL
   *
   * @returns The BackgroundFetchRegistration, or null if registration failed
   */
  async startBackgroundUpload(
    file: File,
    campaignId: string,
    sessionId: string,
    transcriptionMode: 'fast' | 'batch',
    userCorrections?: string
  ): Promise<BackgroundFetchRegistration | null> {
    if (!this.isSupported()) {
      return null;
    }

    try {
      const functions = this.firebase.requireFunctions();

      // 1. Get signed upload URL
      const generateUrl = httpsCallable<
        { campaignId: string; sessionId: string; fileName: string; fileSize: number; contentType: string },
        SignedUploadUrlResponse
      >(functions, 'generateSignedUploadUrl');

      const result = await generateUrl({
        campaignId,
        sessionId,
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type,
      });

      const { signedUrl, storagePath } = result.data;

      logger.info(
        `[BackgroundUpload] Got signed URL for ${file.name}, registering background fetch`
      );

      // 2. Send metadata to service worker
      const swRegistration = await navigator.serviceWorker.ready;
      const fetchId = `upload-${sessionId}-${Date.now()}`;

      const metadata: UploadMetadata = {
        campaignId,
        sessionId,
        storagePath,
        transcriptionMode,
        audioFileName: file.name,
        userCorrections,
        finalizeUrl: FINALIZE_URL,
      };

      await this.sendMetadataToServiceWorker(swRegistration, fetchId, metadata);

      // 3. Register Background Fetch
      const bgFetchRegistration = await swRegistration.backgroundFetch.fetch(
        fetchId,
        new Request(signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        }),
        {
          title: `Uploading ${file.name}`,
          icons: [{ src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' }],
          downloadTotal: file.size
        }
      );

      logger.info(`[BackgroundUpload] Background fetch registered: ${fetchId}`);

      return bgFetchRegistration;
    } catch (error) {
      logger.warn(
        `[BackgroundUpload] Failed to start background upload, falling back to foreground`,
        error
      );
      return null;
    }
  }

  /**
   * Listen for messages from the service worker about upload status.
   */
  listenForMessages(
    callbacks: {
      onComplete?: (data: { sessionId: string; campaignId: string }) => void;
      onFailed?: (data: {
        sessionId: string;
        error: string;
        failureReason?: string;
        status?: number | null;
        statusText?: string | null;
        responseText?: string | null;
      }) => void;
      onAborted?: (data: { sessionId: string }) => void;
    }
  ): void {
    this.stopListening();

    this.messageHandler = (event: MessageEvent) => {
      this.ngZone.run(() => {
        const { type } = event.data;
        switch (type) {
          case 'UPLOAD_COMPLETE':
            callbacks.onComplete?.(event.data);
            break;
          case 'UPLOAD_FAILED':
            callbacks.onFailed?.(event.data);
            break;
          case 'UPLOAD_ABORTED':
            callbacks.onAborted?.(event.data);
            break;
        }
      });
    };

    navigator.serviceWorker.addEventListener('message', this.messageHandler);
  }

  /**
   * Stop listening for service worker messages.
   */
  stopListening(): void {
    if (this.messageHandler) {
      navigator.serviceWorker.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }
  }

  private sendMetadataToServiceWorker(
    registration: ServiceWorkerRegistration,
    fetchId: string,
    metadata: UploadMetadata
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const sw = registration.active;
      if (!sw) {
        reject(new Error('No active service worker'));
        return;
      }

      const channel = new MessageChannel();
      channel.port1.onmessage = (event) => {
        if (event.data?.stored) {
          resolve();
        } else {
          reject(new Error('Service worker did not confirm metadata storage'));
        }
      };

      sw.postMessage(
        { type: 'STORE_UPLOAD_METADATA', fetchId, metadata },
        [channel.port2]
      );

      // Timeout after 5 seconds
      setTimeout(() => reject(new Error('Metadata storage timed out')), 5000);
    });
  }
}
