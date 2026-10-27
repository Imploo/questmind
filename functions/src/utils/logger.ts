import * as Sentry from '@sentry/node';
import * as functionsLogger from 'firebase-functions/logger';
import { isEmulator } from './emulator-helpers';

/**
 * App logger. Writes structured entries to Cloud Logging via the Firebase
 * Functions logger; `error` additionally reports to Sentry (outside the emulator).
 */

export function warn(message: string, context?: unknown): void {
  write(functionsLogger.warn, `[WARN] ${message}`, context);
}

export function info(message: string, context?: unknown): void {
  write(functionsLogger.info, `[INFO] ${message}`, context);
}

export function debug(message: string, context?: unknown): void {
  if (!isEmulator()) return;
  write(functionsLogger.debug, `[DEBUG] ${message}`, context);
}

export function error(message: string, context?: unknown): void {
  logErrorOnly(message, context);

  // Send errors to Sentry in production
  if (!isEmulator()) {
    if (context instanceof Error) {
      Sentry.captureException(context, {
        extra: { message },
      });
    } else {
      Sentry.captureMessage(message, {
        level: 'error',
        extra: context !== undefined ? { context } : undefined,
      });
    }
  }
}

/** Error-level log line WITHOUT a Sentry event — for callers that capture themselves. */
export function logErrorOnly(message: string, context?: unknown): void {
  write(functionsLogger.error, `[ERROR] ${message}`, context);
}

function write(sink: (...args: unknown[]) => void, message: string, context: unknown): void {
  if (context !== undefined) {
    sink(message, context);
  } else {
    sink(message);
  }
}
