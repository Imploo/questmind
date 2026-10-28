import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Point fluent-ffmpeg at the bundled binary once, for every module that imports it from here.
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export { ffmpeg };

/**
 * Run `fn` with a fresh temp directory that is always removed afterwards
 * (/tmp is in-memory on Cloud Run, so leftovers cost RAM).
 */
export async function withTempDir<T>(prefix: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(join(tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
