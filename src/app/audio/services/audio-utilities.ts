import { Observable, timer, throwError } from 'rxjs';

export const MAX_RETRY_ATTEMPTS = 2;
export const RETRY_BASE_DELAY_MS = 1500;
export const MAX_INLINE_AUDIO_BYTES = 18 * 1024 * 1024;
export const MAX_TRANSCRIPTION_OUTPUT_TOKENS = 128000;
export const CHUNK_DURATION_SECONDS = 30 * 60;
export const CHUNK_MIME_TYPE = 'audio/wav';

export function isOverloadedError(error: any): boolean {
  const status = error?.status ?? error?.error?.status;
  const code = error?.code ?? error?.error?.code;
  return status === 503 || status === 'UNAVAILABLE' || code === 503;
}

export function getRetryDelay(error: any, retryCount: number): Observable<number> {
  if (!isOverloadedError(error)) {
    return throwError(() => error);
  }

  const jitter = Math.floor(Math.random() * 300);
  const delayMs = Math.min(10000, RETRY_BASE_DELAY_MS * Math.pow(2, retryCount - 1) + jitter);
  return timer(delayMs);
}
