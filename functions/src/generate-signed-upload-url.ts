import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { storage } from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { ProgressTrackerService } from './services/progress-tracker.service';
import { wrapCallable } from './utils/sentry-error-handler';

interface GenerateSignedUploadUrlRequest {
  campaignId: string;
  sessionId: string;
  fileName: string;
  fileSize: number;
  contentType: string;
}

interface GenerateSignedUploadUrlResponse {
  signedUrl: string;
  storagePath: string;
  storageUrl: string;
}

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

const ALLOWED_CONTENT_TYPES = [
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
  'audio/ogg',
  'audio/webm',
  'audio/flac',
];

export const generateSignedUploadUrl = onCall(
  {
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  wrapCallable<GenerateSignedUploadUrlRequest, GenerateSignedUploadUrlResponse>(
    'generateSignedUploadUrl',
    async (request): Promise<GenerateSignedUploadUrlResponse> => {
    // Validate auth
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { campaignId, sessionId, fileName, fileSize, contentType } = request.data;

    // Validate required fields
    if (!campaignId || !sessionId || !fileName || !fileSize || !contentType) {
      throw new HttpsError(
        'invalid-argument',
        'Missing required fields: campaignId, sessionId, fileName, fileSize, contentType'
      );
    }

    // Validate file size
    if (fileSize > MAX_FILE_SIZE) {
      throw new HttpsError(
        'invalid-argument',
        `File size ${fileSize} exceeds maximum of ${MAX_FILE_SIZE} bytes (500MB)`
      );
    }

    // Validate content type
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      throw new HttpsError(
        'invalid-argument',
        `Unsupported content type: ${contentType}. Allowed: ${ALLOWED_CONTENT_TYPES.join(', ')}`
      );
    }

    // Verify campaign membership
    const db = getFirestore();
    const campaignRef = db.collection('campaigns').doc(campaignId);
    const campaignSnap = await campaignRef.get();

    if (!campaignSnap.exists) {
      throw new HttpsError('not-found', `Campaign ${campaignId} not found`);
    }

    // Verify session exists
    const sessionRef = db
      .collection('campaigns')
      .doc(campaignId)
      .collection('audioSessions')
      .doc(sessionId);

    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) {
      throw new HttpsError('not-found', `Session ${sessionId} not found`);
    }

    // Generate signed URL
    const storagePath = `campaigns/${campaignId}/audio/${sessionId}/${fileName}`;
    const bucket = storage().bucket();
    const file = bucket.file(storagePath);

    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 2 * 60 * 60 * 1000, // 2 hours
      contentType,
    });

    const storageUrl = `gs://${bucket.name}/${storagePath}`;

    // Set initial upload progress in Firestore
    await ProgressTrackerService.updateProgress(
      campaignId,
      sessionId,
      'uploading',
      0,
      'Upload starting...'
    );

      return { signedUrl, storagePath, storageUrl };
    }
  ),
);
