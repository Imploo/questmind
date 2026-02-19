import { Injectable, computed, effect, inject, resource } from '@angular/core';
import {
  doc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

import { AuthService } from '../../auth/auth.service';
import { CampaignContextService } from '../../campaign/campaign-context.service';
import { FirebaseService } from '../../core/firebase.service';
import {
  AudioSessionRecord,
  AudioUpload
} from './audio-session.models';
import { AudioSessionRepositoryFactory } from '../../shared/repository/audio-session.repository';

type SessionRecord = AudioSessionRecord & Record<string, unknown>;

@Injectable({
  providedIn: 'root'
})
export class AudioSessionStateService {
  private readonly firebase = inject(FirebaseService);
  private readonly authService = inject(AuthService);
  private readonly campaignContext = inject(CampaignContextService);
  private readonly sessionRepoFactory = inject(AudioSessionRepositoryFactory);

  private readonly sessionRepo = resource({
    params: () => {
      const user = this.authService.currentUser();
      const campaignId = this.campaignContext.selectedCampaignId();
      if (!user?.uid || !campaignId) return undefined;
      return { userId: user.uid, campaignId };
    },
    loader: async ({ params }) => {
      const repo = this.sessionRepoFactory.create(params.campaignId);
      await repo.waitForData();
      return repo;
    },
  });

  readonly sessions = computed<SessionRecord[]>(() => {
    const repo = this.sessionRepo.value();
    return repo ? repo.get() : [];
  });

  constructor() {
    effect((onCleanup) => {
      const repo = this.sessionRepo.value();
      if (repo) {
        onCleanup(() => repo.destroy());
      }
    });
  }

  getSession(id: string): AudioSessionRecord | undefined {
    return this.sessions().find(session => session.id === id) as AudioSessionRecord | undefined;
  }

  createSessionDraft(upload: AudioUpload): AudioSessionRecord {
    const now = new Date().toISOString();
    const id = this.generateId();
    const title = upload.sessionName?.trim() || this.defaultTitle(upload.file.name);
    const record: AudioSessionRecord = {
      id,
      campaignId: upload.campaignId,
      ownerId: upload.userId,
      ownerEmail: this.authService.currentUser()?.email || '',
      createdBy: upload.userId,
      title,
      content: '',
      sessionDate: upload.sessionDate,
      audioFileName: upload.file.name,
      createdAt: now,
      updatedAt: now,
      status: 'uploading'
    };
    this.writeSession(record, upload.campaignId);
    return record;
  }

  updateSession(id: string, patch: Partial<AudioSessionRecord>): void {
    void this.persistSessionPatch(id, patch).catch(error => {
      console.error('Failed to update audio session in Firestore.', error);
    });
  }

  async persistSessionPatch(id: string, patch: Partial<AudioSessionRecord>): Promise<void> {
    const exists = this.sessions().some(session => session.id === id);
    if (!exists) {
      return;
    }

    const updatedAt = new Date().toISOString();
    const db = this.firebase.firestore;
    const campaignId = this.campaignContext.selectedCampaignId();
    if (!db || !campaignId) {
      throw new Error('No active campaign set for audio sessions.');
    }

    const docRef = doc(db, 'campaigns', campaignId, 'audioSessions', id);
    await updateDoc(docRef, { ...patch, updatedAt });
  }

  private defaultTitle(fileName: string): string {
    const base = fileName.replace(/\.[^/.]+$/, '');
    return `Session: ${base}`;
  }

  private writeSession(record: AudioSessionRecord, campaignId: string): void {
    const db = this.firebase.firestore;
    if (!db) {
      console.error('Firebase is not configured. Cannot save sessions.');
      return;
    }
    const docRef = doc(db, 'campaigns', campaignId, 'audioSessions', record.id);
    void setDoc(docRef, record, { merge: true }).catch(error => {
      console.error('Failed to save audio session to Firestore.', error);
    });
  }

  private generateId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
