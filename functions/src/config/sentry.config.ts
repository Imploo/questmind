import * as Sentry from '@sentry/node';

export function initSentry(): void {
  const sentryDsn = process.env.SENTRY_DSN;
  const environment = process.env.SENTRY_ENVIRONMENT || 'production';

  if (!sentryDsn) {
    console.log('Sentry DSN not configured - error tracking disabled');
    return;
  }

  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    console.log('Sentry disabled in emulator mode');
    return;
  }

  Sentry.init({
    dsn: sentryDsn,
    environment,
    release: process.env.SENTRY_RELEASE || 'unknown',
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    beforeSend(event) {
      // Strip sensitive headers
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }

      return event;
    },
  });

  console.log(`Sentry initialized for environment: ${environment}`);
}
