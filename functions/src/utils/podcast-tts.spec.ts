import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PodcastVoiceSettings } from '../types/audio-session.types';

// ── Mocks ────────────────────────────────────────────────────────────────────

const { mockGenerateContent, mockConvert, mockPcmToMp3 } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
  mockConvert: vi.fn(),
  mockPcmToMp3: vi.fn(),
}));

// Use regular function expressions (not arrow fns) so the SDK clients are
// constructable with `new`.
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(function () {
    return { models: { generateContent: mockGenerateContent } };
  }),
  Modality: { AUDIO: 'AUDIO', TEXT: 'TEXT' },
}));

vi.mock('@elevenlabs/elevenlabs-js', () => ({
  ElevenLabsClient: vi.fn(function () {
    return { textToDialogue: { convert: mockConvert } };
  }),
}));

vi.mock('./pcm-to-mp3', () => ({
  pcmToMp3: (buffer: Buffer, rate: number) => mockPcmToMp3(buffer, rate),
  parsePcmSampleRate: (mime: string | undefined | null) => {
    const match = mime ? /rate=(\d+)/i.exec(mime) : null;
    return match ? Number.parseInt(match[1], 10) : 24000;
  },
  DEFAULT_PCM_SAMPLE_RATE: 24000,
}));

vi.mock('./logger', () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }));

import {
  generatePodcastAudioBuffer,
  chunkSegmentsByChars,
  buildDialogText,
  type PodcastSegment,
} from './podcast-tts';

function voiceConfig(overrides: Partial<PodcastVoiceSettings> = {}): PodcastVoiceSettings {
  return {
    ttsProvider: 'gemini',
    maxCharacters: 5000,
    model: 'eleven_v3',
    host1VoiceId: 'el-host1',
    host2VoiceId: 'el-host2',
    geminiModel: 'gemini-3.1-flash-tts-preview',
    host1VoiceName: 'Puck',
    host2VoiceName: 'Leda',
    ...overrides,
  };
}

function geminiResponse(pcmBytes: number[], mimeType = 'audio/L16;codec=pcm;rate=24000') {
  return {
    candidates: [
      { content: { parts: [{ inlineData: { data: Buffer.from(pcmBytes).toString('base64'), mimeType } }] } },
    ],
  };
}

// ── Pure helpers ───────────────────────────────────────────────────────────

describe('chunkSegmentsByChars', () => {
  it('keeps turns whole and splits on the char limit', () => {
    const segments: PodcastSegment[] = [
      { speaker: 'host1', text: 'a'.repeat(2000) },
      { speaker: 'host2', text: 'b'.repeat(2000) }, // 2000 + 2000 > 3000 → new chunk
      { speaker: 'host1', text: 'c'.repeat(500) },
    ];

    const chunks = chunkSegmentsByChars(segments, 3000);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(1);
    expect(chunks[1]).toHaveLength(2);
  });

  it('never splits a single oversized turn', () => {
    const segments: PodcastSegment[] = [{ speaker: 'host1', text: 'x'.repeat(5000) }];

    const chunks = chunkSegmentsByChars(segments, 3000);

    expect(chunks).toHaveLength(1);
    expect(chunks[0][0].text).toHaveLength(5000);
  });

  it('returns no chunks for an empty script', () => {
    expect(chunkSegmentsByChars([], 3000)).toHaveLength(0);
  });
});

describe('buildDialogText', () => {
  it('labels turns with the speaker config names', () => {
    const segments: PodcastSegment[] = [
      { speaker: 'host1', text: 'Hoi allemaal' },
      { speaker: 'host2', text: 'Welkom terug' },
    ];

    expect(buildDialogText(segments)).toBe('HOST1: Hoi allemaal\nHOST2: Welkom terug');
  });
});

// ── Provider routing ────────────────────────────────────────────────────────

describe('generatePodcastAudioBuffer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_AI_API_KEY = 'test-google-key';
    process.env.ELEVENLABS_API_KEY = 'test-elevenlabs-key';
  });

  it('routes to Gemini, builds a multi-speaker config, and transcodes to MP3', async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse([1, 2, 3, 4]));
    const mp3 = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
    mockPcmToMp3.mockResolvedValue(mp3);

    const segments: PodcastSegment[] = [
      { speaker: 'host1', text: 'Hallo' },
      { speaker: 'host2', text: 'Hoi' },
    ];

    const result = await generatePodcastAudioBuffer(segments, voiceConfig());

    expect(result.equals(mp3)).toBe(true);
    expect(mockConvert).not.toHaveBeenCalled();

    const config = mockGenerateContent.mock.calls[0][0].config;
    expect(config.responseModalities).toEqual(['AUDIO']);
    const speakers = config.speechConfig.multiSpeakerVoiceConfig.speakerVoiceConfigs;
    expect(speakers[0].speaker).toBe('HOST1');
    expect(speakers[0].voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Puck');
    expect(speakers[1].speaker).toBe('HOST2');
    expect(speakers[1].voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Leda');
    expect(mockPcmToMp3).toHaveBeenCalledWith(expect.any(Buffer), 24000);
  });

  it('parses a non-default sample rate from the response mimeType', async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse([1, 2], 'audio/L16;codec=pcm;rate=16000'));
    mockPcmToMp3.mockResolvedValue(Buffer.from([0xff, 0xfb]));

    await generatePodcastAudioBuffer([{ speaker: 'host1', text: 'Hi' }], voiceConfig());

    expect(mockPcmToMp3).toHaveBeenCalledWith(expect.any(Buffer), 16000);
  });

  it('generates one request per chunk and concatenates the PCM before encoding', async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse([7]));
    mockPcmToMp3.mockResolvedValue(Buffer.from([0xff, 0xfb]));

    // Two ~2500-char turns => 5000 chars total => 2 chunks at the 3000 limit.
    const segments: PodcastSegment[] = [
      { speaker: 'host1', text: 'a'.repeat(2500) },
      { speaker: 'host2', text: 'b'.repeat(2500) },
    ];

    await generatePodcastAudioBuffer(segments, voiceConfig());

    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    const pcmArg = mockPcmToMp3.mock.calls[0][0] as Buffer;
    expect(pcmArg.length).toBe(2); // one byte of PCM per chunk
  });

  it('throws when Gemini returns no audio data', async () => {
    mockGenerateContent.mockResolvedValue({ candidates: [{ content: { parts: [{}] } }] });

    await expect(
      generatePodcastAudioBuffer([{ speaker: 'host1', text: 'Hi' }], voiceConfig())
    ).rejects.toThrow(/No audio data/);
  });

  it('routes to ElevenLabs when the provider is elevenlabs', async () => {
    async function* fakeStream() {
      yield new Uint8Array([1, 2, 3]);
    }
    mockConvert.mockResolvedValue(fakeStream());

    const result = await generatePodcastAudioBuffer(
      [{ speaker: 'host1', text: 'Hallo' }],
      voiceConfig({ ttsProvider: 'elevenlabs' })
    );

    expect(result.equals(Buffer.from([1, 2, 3]))).toBe(true);
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(mockPcmToMp3).not.toHaveBeenCalled();
    const convertArg = mockConvert.mock.calls[0][0];
    expect(convertArg.inputs[0].voiceId).toBe('el-host1');
  });
});
