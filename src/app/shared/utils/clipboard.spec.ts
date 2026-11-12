import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './clipboard';

function stubClipboard(clipboard: unknown): void {
  vi.stubGlobal('navigator', { clipboard });
}

describe('copyText', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('writes the text and reports success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText });

    expect(await copyText('https://example.test/characters/1')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://example.test/characters/1');
  });

  it('reports failure when the browser refuses', async () => {
    stubClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    expect(await copyText('x')).toBe(false);
  });

  it('reports failure when there is no clipboard', async () => {
    stubClipboard(undefined);
    expect(await copyText('x')).toBe(false);
  });
});
