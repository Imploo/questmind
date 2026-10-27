import { getStorage } from 'firebase-admin/storage';
import * as logger from './logger';

/** Best-effort delete of Storage files: a leftover file is harmless, so failures are only logged. */
export async function deleteStorageFiles(storagePaths: string[]): Promise<void> {
  const bucket = getStorage().bucket();
  await Promise.all(storagePaths.map((path) =>
    bucket.file(path).delete({ ignoreNotFound: true }).catch((error: unknown) =>
      logger.warn(`[Storage] Could not delete ${path}`, error)
    )
  ));
}
