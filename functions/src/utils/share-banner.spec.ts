import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ffmpeg, withTempDir } from './ffmpeg';
import { BANNER_HEIGHT, BANNER_WIDTH, renderShareBanner } from './share-banner';

/** A square test picture, made with the same bundled ffmpeg. */
function squarePng(): Promise<Buffer> {
  return withTempDir('share-banner-spec-', async dir => {
    const file = join(dir, 'square.png');
    await new Promise<void>((resolve, reject) => {
      ffmpeg('testsrc2=size=512x512:rate=1')
        .inputFormat('lavfi')
        .outputOptions(['-frames:v 1'])
        .on('end', () => resolve())
        .on('error', reject)
        .save(file);
    });
    return fs.readFile(file);
  });
}

/** Width and height from the first start-of-frame segment of a JPEG. */
function jpegSize(jpeg: Buffer): { width: number; height: number } {
  let offset = 2;
  while (offset < jpeg.length) {
    const marker = jpeg[offset + 1];
    const length = jpeg.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: jpeg.readUInt16BE(offset + 5), width: jpeg.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  throw new Error('No start-of-frame segment found');
}

describe('renderShareBanner', () => {
  it('turns a square image into a small 1200x630 JPEG', async () => {
    const banner = await renderShareBanner(await squarePng());

    expect(banner.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(jpegSize(banner)).toEqual({ width: BANNER_WIDTH, height: BANNER_HEIGHT });
    expect(banner.length).toBeLessThan(600 * 1024);
  }, 30_000);

  it('rejects data that is not an image', async () => {
    await expect(renderShareBanner(Buffer.from('not an image'))).rejects.toBeDefined();
  }, 30_000);
});
