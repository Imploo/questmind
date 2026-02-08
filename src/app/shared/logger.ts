import * as Sentry from '@sentry/angular';
import { environment } from '../../environments/environment';

const isProduction = environment.production;

export function warn(message: string, context?: unknown): void {
  if (context !== undefined) {
    console.warn(`[WARN] ${message}`, context);
  } else {
    console.warn(`[WARN] ${message}`);
  }
}

export function info(message: string, context?: unknown): void {
  if (isProduction) return;

  if (context !== undefined) {
    console.info(`[INFO] ${message}`, context);
  } else {
    console.info(`[INFO] ${message}`);
  }
}

export function debug(message: string, context?: unknown): void {
  if (isProduction) return;

  if (context !== undefined) {
    console.log(`[DEBUG] ${message}`, context);
  } else {
    console.log(`[DEBUG] ${message}`);
  }
}

export function error(message: string, context?: unknown): void {
  if (context !== undefined) {
    console.error(`[ERROR] ${message}`, context);
  } else {
    console.error(`[ERROR] ${message}`);
  }

  // Send errors to Sentry in production
  if (isProduction) {
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
