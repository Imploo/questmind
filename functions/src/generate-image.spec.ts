import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockImageSet = vi.fn();
const mockLatestImages = vi.fn();
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => ({ id: 'img-1', set: mockImageSet }),
          orderBy: () => ({ limit: () => ({ get: mockLatestImages }) }),
        }),
      }),
    }),
  }),
  FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
}));

const mockDownload = vi.fn();
const mockSave = vi.fn();
const mockFile = vi.fn<(path: string) => { download: typeof mockDownload; save: typeof mockSave }>(() => ({ download: mockDownload, save: mockSave }));
vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({ bucket: () => ({ name: 'test-bucket', file: mockFile }) }),
}));

const mockGenerateContent = vi.fn();
const mockCreateInteraction = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
    interactions = { create: mockCreateInteraction };
  },
}));

vi.mock('./utils/ai-settings', () => ({
  getAiImageConfig: vi.fn(() => Promise.resolve({ model: 'gemini-nano-banana-2.1' })),
  getAiFeatureConfig: vi.fn(() => Promise.resolve({ model: 'gemini-test', maxOutputTokens: 1024 })),
}));
vi.mock('./utils/logger', () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }));

import { generateCharacterImage, latestCharacterImagePath, resolveImageModel } from './generate-image';
import { getAiImageConfig } from './utils/ai-settings';

// ── Tests ────────────────────────────────────────────────────────────────────

const request = (overrides: Record<string, unknown> = {}) => ({
  characterId: 'char-1',
  chatHistory: [
    { role: 'user' as const, content: 'Huidig karakter:\n{"name":"Borin"}' },
    { role: 'user' as const, content: 'met een rode baard' },
  ],
  ...overrides,
});
const code = (c: string) => expect.objectContaining({ code: c });

describe('generateCharacterImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_AI_API_KEY = 'google-key';
    mockGenerateContent.mockResolvedValue({ text: 'A dwarf with a red beard' });
    mockCreateInteraction.mockResolvedValue({
      status: 'completed',
      output_image: { type: 'image', data: Buffer.from('png-bytes').toString('base64'), mime_type: 'image/png' },
    });
    mockDownload.mockResolvedValue([Buffer.from('ref')]);
  });

  it('writes the image prompt from the conversation with the server-side system prompt', async () => {
    await generateCharacterImage(request());

    const call = mockGenerateContent.mock.calls[0][0];
    expect(call.contents).toEqual([{ text: '[user]: Huidig karakter:\n{"name":"Borin"}\n[user]: met een rode baard' }]);
    expect(call.config.systemInstruction).toContain('D&D karakterportretten');
    expect(call.config.systemInstruction).not.toContain('reference image');
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('sends the previous portrait along as style reference', async () => {
    await generateCharacterImage(request({ referenceImageStoragePath: 'images/char-1/prev.png' }));

    const call = mockGenerateContent.mock.calls[0][0];
    expect(mockFile).toHaveBeenCalledWith('images/char-1/prev.png');
    expect(call.contents[1]).toEqual({ inlineData: { mimeType: 'image/png', data: Buffer.from('ref').toString('base64') } });
    expect(call.config.systemInstruction).toContain('reference image');
  });

  it('carries on without the reference when it cannot be loaded', async () => {
    mockDownload.mockRejectedValueOnce(new Error('not found'));

    await generateCharacterImage(request({ referenceImageStoragePath: 'images/char-1/gone.png' }));

    expect(mockGenerateContent.mock.calls[0][0].contents).toHaveLength(1);
    expect(mockCreateInteraction).toHaveBeenCalledOnce();
  });

  it('renders the portrait with Gemini using the generated prompt', async () => {
    await generateCharacterImage(request());

    expect(mockCreateInteraction).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-nano-banana-2.1',
      input: 'Photorealistic image. A dwarf with a red beard',
      response_format: { type: 'image', aspect_ratio: '4:3' },
      store: false,
    }));
  });

  it('uses the image model from the AI settings', async () => {
    vi.mocked(getAiImageConfig).mockResolvedValueOnce({ model: 'gemini-3-pro-image' });
    await generateCharacterImage(request());
    expect(mockCreateInteraction).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-3-pro-image' }));
  });

  it('replaces a stale non-Gemini model in the AI settings with the default', async () => {
    vi.mocked(getAiImageConfig).mockResolvedValueOnce({ model: 'fal-ai/flux/schnell' });
    await generateCharacterImage(request());
    expect(mockCreateInteraction).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-nano-banana-2.1' }));
  });

  it('throws internal when the image prompt cannot be written', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('gemini down'));
    await expect(generateCharacterImage(request())).rejects.toThrow(code('internal'));
    expect(mockCreateInteraction).not.toHaveBeenCalled();
  });

  it('throws internal when Gemini returns no image', async () => {
    mockCreateInteraction.mockResolvedValueOnce({ status: 'completed', output_text: 'I cannot draw that' });
    await expect(generateCharacterImage(request())).rejects.toThrow(code('internal'));
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('maps a Gemini rate limit to resource-exhausted', async () => {
    mockCreateInteraction.mockRejectedValueOnce(Object.assign(new Error('Too Many Requests'), { status: 429 }));
    await expect(generateCharacterImage(request())).rejects.toThrow(code('resource-exhausted'));
  });

  it('stores the image under the character and returns its URL', async () => {
    const result = await generateCharacterImage(request());

    const savedPath = mockFile.mock.calls.at(-1)?.[0] as string;
    expect(savedPath).toMatch(/^images\/char-1\/.+\.png$/);
    expect(mockSave).toHaveBeenCalledWith(Buffer.from('png-bytes'), { metadata: { contentType: 'image/png' } });
    expect(mockImageSet).toHaveBeenCalledWith(expect.objectContaining({ characterId: 'char-1', storagePath: savedPath }));
    expect(result).toEqual({
      imageUrl: `https://firebasestorage.googleapis.com/v0/b/test-bucket/o/${encodeURIComponent(savedPath)}?alt=media`,
      mimeType: 'image/png',
    });
  });
});

describe('resolveImageModel', () => {
  it('keeps a Gemini model and replaces anything else with the default', () => {
    expect(resolveImageModel('gemini-3-pro-image')).toBe('gemini-3-pro-image');
    expect(resolveImageModel('fal-ai/flux/schnell')).toBe('gemini-nano-banana-2.1');
    expect(resolveImageModel('')).toBe('gemini-nano-banana-2.1');
  });
});

describe('latestCharacterImagePath', () => {
  const images = (...storagePaths: unknown[]) => ({
    empty: storagePaths.length === 0,
    docs: storagePaths.map(storagePath => ({ data: () => ({ storagePath }) })),
  });

  it('returns the newest portrait of the character', async () => {
    mockLatestImages.mockResolvedValueOnce(images('images/char-1/newest.png'));
    expect(await latestCharacterImagePath('char-1')).toBe('images/char-1/newest.png');
  });

  it('returns null without portraits, or for a path outside the character folder', async () => {
    mockLatestImages.mockResolvedValueOnce(images());
    expect(await latestCharacterImagePath('char-1')).toBeNull();

    mockLatestImages.mockResolvedValueOnce(images('images/other-char/portrait.png'));
    expect(await latestCharacterImagePath('char-1')).toBeNull();
  });
});
