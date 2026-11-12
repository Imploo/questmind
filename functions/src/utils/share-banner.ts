import { promises as fs } from 'fs';
import { join } from 'path';
import { ffmpeg, withTempDir } from './ffmpeg';

export const BANNER_WIDTH = 1200;
export const BANNER_HEIGHT = 630;

/**
 * The whole image, as tall as the banner and centred, on a blurred and darkened
 * copy of itself that fills the rest. Nothing of a square portrait is cropped away.
 */
const BANNER_FILTER = [
  `[0:v]scale=${BANNER_WIDTH}:${BANNER_HEIGHT}:force_original_aspect_ratio=increase,` +
    `crop=${BANNER_WIDTH}:${BANNER_HEIGHT},boxblur=24:2,eq=brightness=-0.12[bg]`,
  `[0:v]scale=-2:${BANNER_HEIGHT}[fg]`,
  '[bg][fg]overlay=(W-w)/2:0',
].join(';');

/**
 * Turn an image into a 1200x630 JPEG for link previews. Chat apps skip preview
 * images that are too large (WhatsApp around 600 kB), and a generated portrait is
 * easily a few MB, so the banner is a small JPEG.
 */
export function renderShareBanner(image: Buffer): Promise<Buffer> {
  return withTempDir('share-banner-', async dir => {
    const input = join(dir, 'in');
    const output = join(dir, 'out.jpg');
    await fs.writeFile(input, image);
    await new Promise<void>((resolve, reject) => {
      ffmpeg(input, { timeout: 20 })
        .complexFilter(BANNER_FILTER)
        .outputOptions(['-frames:v 1', '-q:v 4'])
        .on('end', () => resolve())
        .on('error', reject)
        .save(output);
    });
    return fs.readFile(output);
  });
}
