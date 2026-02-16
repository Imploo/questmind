import { getAuth } from 'firebase-admin/auth';
import { onRequest } from 'firebase-functions/v2/https';
import type { Request } from 'express';
import { wrapHttp } from './utils/sentry-error-handler';
import * as logger from './utils/logger';

const MAX_FILE_BYTES = 500 * 1024 * 1024;

interface GeminiUploadResponse {
  file?: {
    uri?: string;
  };
}

type RequestInitWithDuplex = RequestInit & {
  duplex: 'half';
};

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

/**
 * Receives a (browser-compressed) audio file from the frontend and forwards
 * it directly to the Gemini Files API.
 *
 * This proxy exists because the Gemini resumable upload endpoint does not
 * include CORS headers, blocking direct browser uploads.
 */
export const uploadAudioToGemini = onRequest(
  {
    timeoutSeconds: 540,
    memory: '2GiB',
    secrets: ['GOOGLE_AI_API_KEY'],
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

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Google AI API key not configured' });
      return;
    }

    const startUploadResponse = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=resumable&key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Type': mimeType,
          'X-Goog-Upload-Header-Content-Length': String(fileSize),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file: { display_name: fileName },
        }),
      }
    );

    if (!startUploadResponse.ok) {
      const errorText = await startUploadResponse.text();
      logger.error('[uploadAudioToGemini] Failed to initiate Gemini upload', {
        status: startUploadResponse.status,
        errorText,
      });
      res.status(502).json({
        error: 'Failed to initiate Gemini upload',
        details: errorText,
      });
      return;
    }

    const uploadUrl = startUploadResponse.headers.get('x-goog-upload-url');
    if (!uploadUrl) {
      res.status(502).json({ error: 'Gemini did not return an upload URL' });
      return;
    }

    const uploadToGeminiResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': mimeType,
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize',
      },
      body: uploadBody as RequestInit['body'],
      duplex: 'half',
    } as RequestInitWithDuplex);

    if (!uploadToGeminiResponse.ok) {
      const errorText = await uploadToGeminiResponse.text();
      logger.error('[uploadAudioToGemini] Failed to upload to Gemini', {
        status: uploadToGeminiResponse.status,
        errorText,
      });
      res.status(502).json({
        error: 'Failed to upload file to Gemini',
        details: errorText,
      });
      return;
    }

    const uploadResponseBody = (await uploadToGeminiResponse.json()) as GeminiUploadResponse;
    const fileUri = uploadResponseBody.file?.uri;

    if (!fileUri) {
      res.status(502).json({ error: 'Gemini Files API did not return a file URI' });
      return;
    }

    res.status(200).json({ fileUri });
  })
);
