import { Injectable } from '@angular/core';
import * as Sentry from '@sentry/angular';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SentryService {

  static init(): void {
    if (!environment.production || !environment.sentry?.dsn) {
      return;
    }

    Sentry.init({
      dsn: environment.sentry.dsn,
      environment: environment.sentry.environment,

      // // Performance Monitoring
      // tracePropagationTargets: [
      //   'localhost',
      //   /^https:\/\/europe-west1-questmind-dnd\.cloudfunctions\.net/,
      //   /^https:\/\/questmind\.nl/,
      // ],

      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: true,
          blockAllMedia: true,
        }),
        Sentry.captureConsoleIntegration({
          levels: ['error', 'warn'],
        }),
      ],

      // Session replay
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,

      beforeSend(event) {
        if (!environment.production) {
          return null;
        }

        // Strip sensitive headers
        if (event.request?.headers) {
          delete event.request.headers['Authorization'];
          delete event.request.headers['Cookie'];
        }

        return event;
      },
    });
  }

  setUser(userId: string, email?: string, displayName?: string): void {
    Sentry.setUser({
      id: userId,
      email,
      username: displayName,
    });
  }

  clearUser(): void {
    Sentry.setUser(null);
  }

  addBreadcrumb(
    message: string,
    category: string,
    level: Sentry.SeverityLevel = 'info',
    data?: Record<string, unknown>,
  ): void {
    Sentry.addBreadcrumb({
      message,
      category,
      level,
      data,
      timestamp: Date.now() / 1000,
    });
  }

  captureException(error: Error, context?: Record<string, unknown>): void {
    Sentry.captureException(error, { extra: context });
  }

  captureMessage(
    message: string,
    level: Sentry.SeverityLevel = 'info',
    context?: Record<string, unknown>,
  ): void {
    Sentry.captureMessage(message, { level, extra: context });
  }
}
