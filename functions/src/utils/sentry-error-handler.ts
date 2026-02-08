import * as Sentry from '@sentry/node';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { IncomingHttpHeaders } from 'http';
import type { Request, Response } from 'express';

type CallableHandler<TRequest, TResponse> = (request: CallableRequest<TRequest>) => Promise<TResponse>;
type HttpHandler = (req: Request, res: Response) => Promise<void> | void;

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

export function captureException(error: Error, context?: Record<string, unknown>): void {
  console.error('Error captured:', error);
  Sentry.captureException(error, { extra: context });
}

export function captureFunctionError(
  functionName: string,
  error: Error,
  context?: Record<string, unknown>,
): void {
  console.error(`[${functionName}] Error:`, error);
  Sentry.captureException(error, {
    tags: { functionName },
    extra: context,
  });
}

export function handleHttpsError(
  error: unknown,
  functionName: string,
  defaultMessage = 'An error occurred',
): never {
  if (error instanceof HttpsError) {
    captureFunctionError(functionName, error);
    throw error;
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  const httpsError = new HttpsError('internal', `${defaultMessage}: ${errorMessage}`);

  captureFunctionError(functionName, httpsError, { originalError: error });

  throw httpsError;
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

export function wrapHttp(functionName: string, handler: HttpHandler): HttpHandler {
  return async (req, res) => {
    const traceHeader = getHeaderValue(req.headers, 'x-cloud-trace-context');
    const requestId = getHeaderValue(req.headers, 'x-request-id');
    const bodyKeys = getDataKeys(req.body);

    Sentry.setContext('function', {
      name: functionName,
      region: process.env.FUNCTION_REGION ?? process.env.GCLOUD_REGION ?? 'unknown',
      requestId,
      trace: traceHeader,
    });

    Sentry.setContext('request', {
      method: req.method,
      path: req.path,
      userAgent: getHeaderValue(req.headers, 'user-agent'),
      bodyKeys,
    });

    try {
      await handler(req, res);
    } catch (error) {
      const normalizedError = normalizeError(error);
      captureFunctionError(functionName, normalizedError, {
        requestId,
        trace: traceHeader,
        bodyKeys,
      });
      await Sentry.flush(2000);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
        return;
      }
      throw error;
    } finally {
      Sentry.setUser(null);
    }
  };
}
