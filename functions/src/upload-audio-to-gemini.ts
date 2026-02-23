import { getAuth } from 'firebase-admin/auth';
import { onRequest } from 'firebase-functions/v2/https';
import type { Request, Response } from 'express';
import { wrapHttp } from './utils/sentry-error-handler';
import * as logger from './utils/logger';

const MAX_FILE_BYTES = 500 * 1024 * 1024;
const GEMINI_UPLOAD_URL_PREFIX = 'https://generativelanguage.googleapis.com/';

interface GeminiUploadResponse {
  file?: {
    uri?: string;
  };
}

type RequestInitWithDuplex = RequestInit & {
  duplex: 'half';
};

interface InitRequestBody {
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
}

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

/**
 * Initiate a Gemini resumable upload session.
 * Returns the Gemini session URL that the client will use for chunk uploads.
 */
async function handleInit(req: Request, res: Response): Promise<void> {
  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as InitRequestBody;

  const mimeType = normalizeMimeType(body.mimeType);
  if (!mimeType) {
    res.status(400).json({
      error: 'Unsupported or missing audio mime type',
      details: {
        received: body.mimeType ?? null,
        supported: Array.from(SUPPORTED_AUDIO_MIME_TYPES),
      },
    });
    return;
  }

  const fileSize = body.fileSize;
  if (!fileSize || !Number.isFinite(fileSize) || fileSize <= 0) {
    res.status(400).json({ error: 'Missing or invalid fileSize' });
    return;
  }

  if (fileSize > MAX_FILE_BYTES) {
    res.status(413).json({ error: 'File too large. Maximum is 500MB.' });
    return;
  }

  const fileName = body.fileName ? decodeURIComponent(body.fileName) : 'audio-upload';

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
    logger.error('[uploadAudioToGemini:init] Failed to initiate Gemini upload', {
      status: startUploadResponse.status,
      errorText,
    });
    res.status(502).json({ error: 'Failed to initiate Gemini upload', details: errorText });
    return;
  }

  const uploadUrl = startUploadResponse.headers.get('x-goog-upload-url');
  if (!uploadUrl) {
    res.status(502).json({ error: 'Gemini did not return an upload URL' });
    return;
  }

  res.status(200).json({ uploadUrl });
}

/**
 * Forward a binary chunk to the Gemini resumable upload session.
 * Intermediate chunks return {ok: true}, the final chunk returns {fileUri}.
 */
async function handleUpload(req: Request, res: Response): Promise<void> {
  const uploadUrl = getSingleHeaderValue(req.headers['x-upload-url']);
  if (!uploadUrl) {
    res.status(400).json({ error: 'Missing X-Upload-Url header' });
    return;
  }

  // SSRF protection: only allow forwarding to Gemini
  if (!uploadUrl.startsWith(GEMINI_UPLOAD_URL_PREFIX)) {
    res.status(400).json({ error: 'Invalid upload URL' });
    return;
  }

  const offsetHeader = getSingleHeaderValue(req.headers['x-upload-offset']);
  const offset = offsetHeader != null ? Number(offsetHeader) : NaN;
  if (!Number.isFinite(offset) || offset < 0) {
    res.status(400).json({ error: 'Missing or invalid X-Upload-Offset header' });
    return;
  }

  const isFinal = getSingleHeaderValue(req.headers['x-is-final']) === 'true';

  const mimeType = normalizeMimeType(getSingleHeaderValue(req.headers['x-mime-type']));
  if (!mimeType) {
    res.status(400).json({ error: 'Missing or invalid X-Mime-Type header' });
    return;
  }

  const uploadBody = getUploadBody(req);
  const command = isFinal ? 'upload, finalize' : 'upload';

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': mimeType,
      'X-Goog-Upload-Offset': String(offset),
      'X-Goog-Upload-Command': command,
    },
    body: uploadBody as RequestInit['body'],
    duplex: 'half',
  } as RequestInitWithDuplex);

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    logger.error('[uploadAudioToGemini:upload] Failed to upload chunk to Gemini', {
      status: uploadResponse.status,
      offset,
      isFinal,
      errorText,
    });
    res.status(502).json({ error: 'Failed to upload chunk to Gemini', details: errorText });
    return;
  }

  if (!isFinal) {
    res.status(200).json({ ok: true });
    return;
  }

  const responseBody = (await uploadResponse.json()) as GeminiUploadResponse;
  const fileUri = responseBody.file?.uri;
  if (!fileUri) {
    res.status(502).json({ error: 'Gemini Files API did not return a file URI' });
    return;
  }

  res.status(200).json({ fileUri });
}

/**
 * Chunked audio upload proxy to the Gemini Files API.
 *
 * This proxy exists because the Gemini resumable upload endpoint does not
 * include CORS headers, blocking direct browser uploads. The upload is split
 * into two phases to stay under the 32 MB Google Frontend request body limit:
 *
 *   ?action=init   — Start a Gemini resumable upload session (small JSON body)
 *   ?action=upload — Forward a binary chunk (≤25 MB) to the Gemini session
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

    // ── Shared auth verification ──────────────────────────────────────────
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

    // ── Action routing ────────────────────────────────────────────────────
    const action = req.query['action'] as string | undefined;

    switch (action) {
      case 'init':
        await handleInit(req, res);
        break;
      case 'upload':
        await handleUpload(req, res);
        break;
      default:
        res.status(400).json({
          error: 'Missing or invalid action parameter. Use ?action=init or ?action=upload',
        });
        break;
    }
  })
);
