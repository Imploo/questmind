import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { onRequest } from 'firebase-functions/v2/https';
import type { Request } from 'express';
import { wrapHttp } from './utils/sentry-error-handler';
import * as logger from './utils/logger';

const MAX_FILE_BYTES = 500 * 1024 * 1024;

const MIME_TYPE_MAP: Record<string, string> = {
  'audio/x-wav': 'audio/wav',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
};

const SUPPORTED_AUDIO_MIME_TYPES = new Set<string>([
  'audio/mpeg',
  'audio/wav',
  'audio/mp4',
  'audio/ogg',
  'audio/webm',
  'audio/flac',
]);

function getSingleHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function getBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

function normalizeMimeType(rawMimeType: string | undefined): string | null {
  if (!rawMimeType) {
    return null;
  }

  const baseMimeType = rawMimeType.split(';')[0].trim().toLowerCase();
  const normalized = MIME_TYPE_MAP[baseMimeType] ?? baseMimeType;
  return SUPPORTED_AUDIO_MIME_TYPES.has(normalized) ? normalized : null;
}

function parseFileSize(
  explicitFileSizeHeader: string | undefined,
  contentLengthHeader: string | undefined
): number | null {
  const rawSize = explicitFileSizeHeader ?? contentLengthHeader;
  if (!rawSize) {
    return null;
  }
  const parsed = Number(rawSize);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.floor(parsed);
}

function getUploadBody(req: Request): Request | Buffer {
  if (!req.readableEnded) {
    return req;
  }

  const requestWithRawBody = req as Request & { rawBody?: Buffer };
  if (requestWithRawBody.rawBody && requestWithRawBody.rawBody.length > 0) {
    return requestWithRawBody.rawBody;
  }

  throw new Error('Upload request body is empty');
}

function getBodySize(body: Request | Buffer): number | null {
  if (Buffer.isBuffer(body)) {
    return body.length;
  }
  return null;
}

async function readBodyAsBuffer(body: Request | Buffer): Promise<Buffer> {
  if (Buffer.isBuffer(body)) {
    return body;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Receives an audio file from the frontend and uploads it to GCloud Storage.
 *
 * Returns a gs:// URI for use with Vertex AI (transcription).
 */
export const uploadAudioToGemini = onRequest(
  {
    timeoutSeconds: 540,
    memory: '1GiB',
    secrets: [],
    cors: true,
  },
  wrapHttp('uploadAudioToGemini', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed. Use POST.' });
      return;
    }

    const authorizationHeader = getSingleHeaderValue(req.headers.authorization);
    const token = getBearerToken(authorizationHeader);
    if (!token) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    try {
      await getAuth().verifyIdToken(token);
    } catch (error: unknown) {
      logger.warn('[uploadAudioToGemini] Invalid Firebase auth token', error);
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const fileNameHeader = getSingleHeaderValue(req.headers['x-file-name']);
    const fileName = fileNameHeader ? decodeURIComponent(fileNameHeader) : 'audio-upload';
    const campaignId = getSingleHeaderValue(req.headers['x-campaign-id']);
    const sessionId = getSingleHeaderValue(req.headers['x-session-id']);

    if (!campaignId || !sessionId) {
      res.status(400).json({ error: 'Missing required headers: x-campaign-id, x-session-id' });
      return;
    }

    const mimeTypeHeader = getSingleHeaderValue(req.headers['x-mime-type']);
    const contentTypeHeader = getSingleHeaderValue(req.headers['content-type']);
    const mimeType = normalizeMimeType(mimeTypeHeader ?? contentTypeHeader);
    if (!mimeType) {
      res.status(400).json({
        error: 'Unsupported or missing audio mime type',
        details: {
          received: mimeTypeHeader ?? contentTypeHeader ?? null,
          supported: Array.from(SUPPORTED_AUDIO_MIME_TYPES),
        },
      });
      return;
    }

    const headerFileSize = parseFileSize(
      getSingleHeaderValue(req.headers['x-file-size']),
      getSingleHeaderValue(req.headers['content-length'])
    );

    const uploadBody = getUploadBody(req);
    const bodySize = getBodySize(uploadBody);
    const fileSize = headerFileSize ?? bodySize;
    if (!fileSize) {
      res.status(400).json({
        error: 'Missing file size. Include X-File-Size header.',
      });
      return;
    }

    if (fileSize > MAX_FILE_BYTES) {
      res.status(413).json({ error: 'File too large. Maximum is 500MB.' });
      return;
    }

    const audioBuffer = await readBodyAsBuffer(uploadBody);

    const bucket = getStorage().bucket();
    const filePath = `campaigns/${campaignId}/audio/${sessionId}/${fileName}`;
    const file = bucket.file(filePath);

    await file.save(audioBuffer, {
      metadata: { contentType: mimeType },
    });

    const gsUri = `gs://${bucket.name}/${filePath}`;
    logger.debug(`[uploadAudioToGemini] Uploaded to ${gsUri}`);

    res.status(200).json({ gsUri });
  })
);
