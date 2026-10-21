import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PodcastVoiceSettings } from '../types/audio-session.types';

// ── Mocks ────────────────────────────────────────────────────────────────────

const { mockCreateInteraction, mockConvert, mockPcmToMp3 } = vi.hoisted(() => ({
  mockCreateInteraction: vi.fn(),
  mockConvert: vi.fn(),
  mockPcmToMp3: vi.fn(),
}));

// Use regular function expressions (not arrow fns) so the SDK clients are
// constructable with `new`.
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(function () {
    return { interactions: { create: mockCreateInteraction } };
  }),
}));

vi.mock('@elevenlabs/elevenlabs-js', () => ({
  ElevenLabsClient: vi.fn(function () {
    return { textToDialogue: { convert: mockConvert } };
  }),
}));

vi.mock('./pcm-to-mp3', () => ({
  pcmToMp3: (buffer: Buffer, rate: number) => mockPcmToMp3(buffer, rate),
  DEFAULT_PCM_SAMPLE_RATE: 24000,
}));

vi.mock('./logger', () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }));

import {
  generatePodcastAudioBuffer,
  chunkSegmentsByChars,
  buildTurns,
  type PodcastSegment,
} from './podcast-tts';

function voiceConfig(overrides: Partial<PodcastVoiceSettings> = {}): PodcastVoiceSettings {
  return {
    ttsProvider: 'gemini',
    maxCharacters: 5000,
    model: 'eleven_v3',
    host1VoiceId: 'el-host1',
    host2VoiceId: 'el-host2',
    geminiModel: 'gemini-3.8-flash-tts',
    host1VoiceName: 'Puck',
    host2VoiceName: 'Leda',
    ...overrides,
  };
}

function geminiResponse(pcmBytes: number[], sampleRate: number | undefined = 24000) {
  return {
    id: 'interaction-1',
    output_audio: {
      type: 'audio',
      data: Buffer.from(pcmBytes).toString('base64'),
      mime_type: 'audio/l16',
      sample_rate: sampleRate,
    },
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

describe('buildTurns', () => {
  it('keeps text verbatim and puts speaker + style in speech_metadata', () => {
    const turns = buildTurns([
      { speaker: 'host1', text: 'Hoi allemaal' },
      { speaker: 'host2', text: 'Welkom terug' },
    ]);

    expect(turns.map(t => t.text)).toEqual(['Hoi allemaal', 'Welkom terug']);
    expect(turns.map(t => t.annotations[0].speaker)).toEqual(['HOST1', 'HOST2']);
    for (const turn of turns) {
      expect(turn.type).toBe('text');
      expect(turn.annotations[0].type).toBe('speech_metadata');
      expect(turn.annotations[0].style).toBeTruthy();
    }
  });
});

// ── Provider routing ────────────────────────────────────────────────────────

describe('generatePodcastAudioBuffer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_AI_API_KEY = 'test-google-key';
    process.env.ELEVENLABS_API_KEY = 'test-elevenlabs-key';
  });

  it('routes to Gemini, builds a multi-speaker interaction, and transcodes to MP3', async () => {
    mockCreateInteraction.mockResolvedValue(geminiResponse([1, 2, 3, 4]));
    const mp3 = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
    mockPcmToMp3.mockResolvedValue(mp3);

    const segments: PodcastSegment[] = [
      { speaker: 'host1', text: 'Hallo' },
      { speaker: 'host2', text: 'Hoi' },
    ];

    const result = await generatePodcastAudioBuffer(segments, voiceConfig());

    expect(result.equals(mp3)).toBe(true);
    expect(mockConvert).not.toHaveBeenCalled();

    const request = mockCreateInteraction.mock.calls[0][0];
    expect(request.model).toBe('gemini-3.8-flash-tts');
    expect(request.response_format).toEqual({ type: 'audio', mime_type: 'audio/l16', sample_rate: 24000 });
    expect(request.generation_config.speech_config.speakers).toEqual([
      { speaker: 'HOST1', voice: 'Puck' },
      { speaker: 'HOST2', voice: 'Leda' },
    ]);
    const content = request.input[0].content;
    expect(request.input[0].type).toBe('user_input');
    expect(content.map((t: { text: string }) => t.text)).toEqual(['Hallo', 'Hoi']);
    expect(content[0].annotations[0].speaker).toBe('HOST1');
    expect(content[1].annotations[0].speaker).toBe('HOST2');
    expect(mockPcmToMp3).toHaveBeenCalledWith(expect.any(Buffer), 24000);
  });

  it('uses the sample rate reported in output_audio', async () => {
    mockCreateInteraction.mockResolvedValue(geminiResponse([1, 2], 16000));
    mockPcmToMp3.mockResolvedValue(Buffer.from([0xff, 0xfb]));

    await generatePodcastAudioBuffer([{ speaker: 'host1', text: 'Hi' }], voiceConfig());

    expect(mockPcmToMp3).toHaveBeenCalledWith(expect.any(Buffer), 16000);
  });

  it('falls back to 24 kHz when output_audio has no sample rate', async () => {
    mockCreateInteraction.mockResolvedValue(geminiResponse([1, 2], undefined));
    mockPcmToMp3.mockResolvedValue(Buffer.from([0xff, 0xfb]));

    await generatePodcastAudioBuffer([{ speaker: 'host1', text: 'Hi' }], voiceConfig());

    expect(mockPcmToMp3).toHaveBeenCalledWith(expect.any(Buffer), 24000);
  });

  it('generates one request per chunk and concatenates the PCM before encoding', async () => {
    mockCreateInteraction.mockResolvedValue(geminiResponse([7]));
    mockPcmToMp3.mockResolvedValue(Buffer.from([0xff, 0xfb]));

    // Two ~2500-char turns => 5000 chars total => 2 chunks at the 3000 limit.
    const segments: PodcastSegment[] = [
      { speaker: 'host1', text: 'a'.repeat(2500) },
      { speaker: 'host2', text: 'b'.repeat(2500) },
    ];

    await generatePodcastAudioBuffer(segments, voiceConfig());

    expect(mockCreateInteraction).toHaveBeenCalledTimes(2);
    const pcmArg = mockPcmToMp3.mock.calls[0][0] as Buffer;
    expect(pcmArg.length).toBe(2); // one byte of PCM per chunk
  });

  it('throws when Gemini returns no audio data', async () => {
    mockCreateInteraction.mockResolvedValue({ id: 'interaction-1' });

    await expect(
      generatePodcastAudioBuffer([{ speaker: 'host1', text: 'Hi' }], voiceConfig())
    ).rejects.toThrow(/No audio data/);
  });

  it('throws when the interaction reports errors', async () => {
    mockCreateInteraction.mockResolvedValue({ id: 'interaction-1', errors: [{ message: 'bad speaker' }] });

    await expect(
      generatePodcastAudioBuffer([{ speaker: 'host1', text: 'Hi' }], voiceConfig())
    ).rejects.toThrow(/bad speaker/);
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
    expect(mockCreateInteraction).not.toHaveBeenCalled();
    expect(mockPcmToMp3).not.toHaveBeenCalled();
    const convertArg = mockConvert.mock.calls[0][0];
    expect(convertArg.inputs[0].voiceId).toBe('el-host1');
  });
});
