import * as logger from '../utils/logger';
import {CallableRequest, onCall} from 'firebase-functions/v2/https';

/**
 * Worker payload for chain communication
 */
export interface WorkerPayload {
  sessionId: string;
  [key: string]: unknown; // Additional data specific to each worker
}

/**
 * Type for worker handler function
 */
export type WorkerHandler = (data: WorkerPayload) => Promise<void>;

/**
 * Service for managing worker chain communication
 * Uses direct function invocation pattern with fire-and-forget
 */
export class WorkerQueueService {
  private static handlerMap = new WeakMap<object, WorkerHandler>();
  /**
   * Trigger the next worker in the chain by calling it asynchronously
   * This is a fire-and-forget pattern - we don't wait for the result
   */
  static async triggerWorker(
    workerHandler: WorkerHandler,
    payload: WorkerPayload
  ): Promise<void> {
    logger.debug(
      `[WorkerQueue] Triggered worker for session ${payload.sessionId}`
    );

    try {
      await workerHandler(payload);
    } catch (error) {
      // Errors are logged but don't affect the caller
      logger.error(
        `[WorkerQueue] Error triggering worker for session ${payload.sessionId}:`,
        error
      );
    }
  }

  /**
   * Create a worker function wrapper that handles the common pattern:
   * 1. Return immediately
   * 2. Process work asynchronously in background
   */
  static createWorker(workerName: string, handler: WorkerHandler) {
    // Store the handler for internal use
    const workerFunc = onCall(
      {
        timeoutSeconds: 1200, // 20 minutes default
        memory: '2GiB',
        secrets: ['GOOGLE_AI_API_KEY', 'KANKA_API_TOKEN'],
      },
      async (
        request: CallableRequest
      ): Promise<{success: boolean; stage: string}> => {
        const data = request.data as WorkerPayload;
        const {sessionId} = data;

        logger.debug(`[${workerName}] Started for session ${sessionId}`);

        try {
          await handler(data);
          logger.debug(`[${workerName}] Completed for session ${sessionId}`);

          return {
            success: true,
            stage: workerName,
          };
        } catch (error) {
          logger.error(`[${workerName}] Error for session ${sessionId}:`, error);
          throw error;
        }
      }
    );

    // Attach the handler to the function for internal calls
    this.handlerMap.set(workerFunc, handler);

    return workerFunc;
  }

  /**
   * Get the internal handler from a worker function
   */
  static getHandler(workerFunc: object): WorkerHandler | undefined {
    return this.handlerMap.get(workerFunc);
  }
}
