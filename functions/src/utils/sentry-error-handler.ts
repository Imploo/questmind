import * as Sentry from '@sentry/node';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { IncomingHttpHeaders } from 'http';
import { logErrorOnly, warn } from './logger';

type CallableHandler<TRequest, TResponse> = (request: CallableRequest<TRequest>) => Promise<TResponse>;

/**
 * HttpsError codes that signal a bad or unauthorized request, not a bug. They
 * are expected in normal use, so they become a breadcrumb instead of an event.
 */
const EXPECTED_CLIENT_ERROR_CODES = new Set<string>([
  'invalid-argument',
  'unauthenticated',
  'permission-denied',
  'not-found',
  'failed-precondition',
  'already-exists',
]);

const getHeaderValue = (
  headers: IncomingHttpHeaders | undefined,
  name: string,
): string | undefined => {
  const value = headers?.[name];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

const normalizeError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error;
  }
  return new Error(typeof error === 'string' ? error : String(error));
};

const getDataKeys = (data: unknown): string[] | undefined => {
  if (!data || typeof data !== 'object') {
    return undefined;
  }
  return Object.keys(data as Record<string, unknown>);
};

export function isExpectedClientError(error: unknown): error is HttpsError {
  return error instanceof HttpsError && EXPECTED_CLIENT_ERROR_CODES.has(error.code);
}

export function captureException(error: Error, context?: Record<string, unknown>): void {
  logErrorOnly('Error captured:', error);
  Sentry.captureException(error, { extra: context });
}

export function captureFunctionError(
  functionName: string,
  error: Error,
  context?: Record<string, unknown>,
): void {
  logErrorOnly(`[${functionName}] Error:`, error);
  Sentry.captureException(error, {
    tags: { functionName },
    extra: context,
  });
}

export function wrapCallable<TRequest, TResponse>(
  functionName: string,
  handler: CallableHandler<TRequest, TResponse>,
): CallableHandler<TRequest, TResponse> {
  return async (request) => {
    const traceHeader = getHeaderValue(request.rawRequest?.headers, 'x-cloud-trace-context');
    const requestId = getHeaderValue(request.rawRequest?.headers, 'x-request-id');
    const dataKeys = getDataKeys(request.data);

    Sentry.setContext('function', {
      name: functionName,
      region: process.env.FUNCTION_REGION ?? process.env.GCLOUD_REGION ?? 'unknown',
      requestId,
      trace: traceHeader,
    });

    Sentry.setContext('request', {
      dataKeys,
      hasAuth: Boolean(request.auth),
    });

    if (request.auth?.uid) {
      Sentry.setUser({ id: request.auth.uid });
    }

    try {
      return await handler(request);
    } catch (error) {
      if (isExpectedClientError(error)) {
        warn(`[${functionName}] ${error.code}: ${error.message}`);
        Sentry.addBreadcrumb({
          category: 'callable',
          level: 'warning',
          message: `${functionName}: ${error.code}`,
          data: { message: error.message },
        });
        throw error;
      }
      const normalizedError = normalizeError(error);
      captureFunctionError(functionName, normalizedError, {
        requestId,
        trace: traceHeader,
        dataKeys,
      });
      await Sentry.flush(2000);
      throw error;
    } finally {
      Sentry.setUser(null);
    }
  };
}
