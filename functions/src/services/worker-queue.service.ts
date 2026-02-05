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
  /**
   * Trigger the next worker in the chain by calling it asynchronously
   * This is a fire-and-forget pattern - we don't wait for the result
   */
  static async triggerWorker(
    workerHandler: WorkerHandler,
    payload: WorkerPayload
  ): Promise<void> {
    // Trigger the next worker asynchronously (fire-and-forget)
    // This allows the current worker to complete immediately
    setImmediate(async () => {
      try {
        await workerHandler(payload);
      } catch (error) {
        // Errors are logged but don't affect the caller
        console.error(
          `[WorkerQueue] Error triggering worker for session ${payload.sessionId}:`,
          error
        );
      }
    });

    console.log(
      `[WorkerQueue] Triggered worker for session ${payload.sessionId}`
    );
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
        region: 'europe-west4',
        timeoutSeconds: 1200, // 20 minutes default
        memory: '2GiB',
        secrets: ['GOOGLE_AI_API_KEY'], // Add secrets for all workers
      },
      async (
        request: CallableRequest
      ): Promise<{success: boolean; stage: string}> => {
        const data = request.data as WorkerPayload;
        const {sessionId} = data;

        console.log(`[${workerName}] Started for session ${sessionId}`);

        try {
          // Execute the worker logic asynchronously
          // We return immediately but processing continues
          setImmediate(async () => {
            try {
              await handler(data);
              console.log(`[${workerName}] Completed for session ${sessionId}`);
            } catch (error) {
              console.error(
                `[${workerName}] Error for session ${sessionId}:`,
                error
              );
            }
          });

          // Return immediately (fire-and-forget pattern)
          return {
            success: true,
            stage: workerName,
          };
        } catch (error) {
          console.error(`[${workerName}] Immediate error:`, error);
          throw error;
        }
      }
    );

    // Attach the handler to the function for internal calls
    (workerFunc as any).__handler = handler;

    return workerFunc;
  }

  /**
   * Get the internal handler from a worker function
   */
  static getHandler(workerFunc: any): WorkerHandler {
    return workerFunc.__handler;
  }
}
