import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { wrapCallable } from './utils/sentry-error-handler';

export interface InitiateGeminiUploadRequest {
  mimeType: string;
  fileName: string;
  fileSize: number;
}

export interface InitiateGeminiUploadResponse {
  uploadUrl: string;
}

/**
 * Initiates a resumable upload session with the Gemini Files API.
 *
 * Returns a pre-authenticated upload URL that the client can use to
 * upload the audio file directly to Gemini — without exposing the API key.
 *
 * After uploading, the client receives a fileUri that can be passed
 * directly to transcribeAudioFast.
 */
export const initiateGeminiUpload = onCall(
  {
    timeoutSeconds: 30,
    memory: '256MiB',
    secrets: ['GOOGLE_AI_API_KEY'],
  },
  wrapCallable<InitiateGeminiUploadRequest, InitiateGeminiUploadResponse>(
    'initiateGeminiUpload',
    async (request): Promise<InitiateGeminiUploadResponse> => {
      const { mimeType, fileName, fileSize } = request.data;

      if (!mimeType || !fileName || !fileSize) {
        throw new HttpsError(
          'invalid-argument',
          'Missing required fields: mimeType, fileName, fileSize'
        );
      }

      const apiKey = process.env.GOOGLE_AI_API_KEY;
      if (!apiKey) {
        throw new HttpsError(
          'failed-precondition',
          'Google AI API key not configured'
        );
      }

      const response = await fetch(
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

      if (!response.ok) {
        const error = await response.text();
        throw new HttpsError(
          'internal',
          `Failed to initiate Gemini upload: ${error}`
        );
      }

      const uploadUrl = response.headers.get('x-goog-upload-url');
      if (!uploadUrl) {
        throw new HttpsError(
          'internal',
          'Gemini did not return an upload URL'
        );
      }

      return { uploadUrl };
    }
  )
);
