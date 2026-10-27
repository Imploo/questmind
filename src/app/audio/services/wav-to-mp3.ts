import { Mp3Encoder } from '@breezystack/lamejs';

/** Sample rate of the encoded upload — the backend resamples to this anyway. */
const TARGET_SAMPLE_RATE = 24_000;
/**
 * 96 kbps mono at 24 kHz: the backend re-encodes to 64 kbps after normalizing,
 * so the upload keeps headroom against generation loss while staying ~10–20×
 * smaller than the WAV (3h ≈ 130 MB instead of 1–3 GB).
 */
const UPLOAD_BITRATE_KBPS = 96;
/** WAV data read per step (rounded down to whole frames). */
const READ_BLOCK_BYTES = 4 * 1024 * 1024;
const MP3_CHUNK_SIZE = 1152; // PCM samples per MPEG Layer-3 frame

const WAVE_FORMAT_PCM = 1;
const WAVE_FORMAT_IEEE_FLOAT = 3;
const WAVE_FORMAT_EXTENSIBLE = 0xfffe;

export interface WavFormat {
  /** 1 = integer PCM, 3 = IEEE float. */
  format: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataOffset: number;
  dataSize: number;
}

export interface WavEncodeResult {
  blob: Blob;
  durationSeconds: number;
}

export function isWavFile(file: File): boolean {
  return /^audio\/(x-)?wav(e)?$/i.test(file.type) || /\.wav$/i.test(file.name);
}

/** A file ready for upload: a browser-compressed WAV, or the original file. */
export interface PreparedUpload {
  blob: Blob;
  fileName: string;
}

/**
 * Prepare an audio file for upload to the backend pipeline. WAV is compressed
 * in the browser (10–20× smaller upload); other formats are already compressed
 * and stay as they are. A WAV the streaming encoder can't read is uploaded
 * unchanged — ffmpeg in the backend handles it.
 */
export async function prepareForUpload(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<PreparedUpload> {
  if (!isWavFile(file)) {
    return { blob: file, fileName: file.name };
  }
  try {
    const { blob } = await encodeWavToMp3(file, onProgress);
    return { blob, fileName: file.name.replace(/\.[^/.]+$/, '') + '.mp3' };
  } catch {
    return { blob: file, fileName: file.name };
  }
}

/**
 * Compress a WAV file to mono MP3 in the browser, streaming it block by block.
 *
 * Unlike decodeAudioData (which decodes the whole recording into memory — ~4 GB
 * for 3h of 48 kHz stereo), memory stays at a few MB regardless of file size.
 * Channels are averaged (a DJI dual-channel file keeps both mics) and the audio
 * is area-averaged down to 24 kHz. Throws for WAV variants it can't read; the
 * caller then uploads the original file instead.
 */
export async function encodeWavToMp3(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<WavEncodeResult> {
  const fmt = await readWavFormat(file);
  const bytesPerSample = fmt.bitsPerSample / 8;
  const frameBytes = bytesPerSample * fmt.channels;
  const outRate = Math.min(TARGET_SAMPLE_RATE, fmt.sampleRate);
  const ratio = fmt.sampleRate / outRate; // ≥ 1 input frames per output sample
  const readSample = sampleReader(fmt);

  const encoder = new Mp3Encoder(1, outRate, UPLOAD_BITRATE_KBPS);
  const mp3Parts: ArrayBuffer[] = [];
  const pending = new Int16Array(MP3_CHUNK_SIZE);
  let pendingLength = 0;

  // Area-average resampler state, carried across blocks.
  let acc = 0;
  let accCount = 0;
  let inputFrames = 0;
  let outputSamples = 0;
  let nextBoundary = ratio;

  const blockBytes = Math.max(frameBytes, Math.floor(READ_BLOCK_BYTES / frameBytes) * frameBytes);
  const dataEnd = fmt.dataOffset + fmt.dataSize;

  onProgress?.(0);
  for (let offset = fmt.dataOffset; offset < dataEnd; offset += blockBytes) {
    const end = Math.min(dataEnd, offset + blockBytes);
    const view = new DataView(await file.slice(offset, end).arrayBuffer());
    const frames = Math.floor(view.byteLength / frameBytes);

    for (let f = 0; f < frames; f++) {
      const base = f * frameBytes;
      let sum = 0;
      for (let c = 0; c < fmt.channels; c++) {
        sum += readSample(view, base + c * bytesPerSample);
      }
      acc += sum / fmt.channels;
      accCount++;
      inputFrames++;

      if (inputFrames >= nextBoundary) {
        const s = Math.max(-1, Math.min(1, acc / accCount));
        pending[pendingLength++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        acc = 0;
        accCount = 0;
        outputSamples++;
        nextBoundary = (outputSamples + 1) * ratio;

        if (pendingLength === MP3_CHUNK_SIZE) {
          pushMp3(mp3Parts, encoder.encodeBuffer(pending));
          pendingLength = 0;
        }
      }
    }

    onProgress?.(Math.round(((end - fmt.dataOffset) / fmt.dataSize) * 100));
    await yieldToMain();
  }

  if (pendingLength > 0) {
    pushMp3(mp3Parts, encoder.encodeBuffer(pending.subarray(0, pendingLength)));
  }
  pushMp3(mp3Parts, encoder.flush());
  onProgress?.(100);

  return {
    blob: new Blob(mp3Parts, { type: 'audio/mpeg' }),
    durationSeconds: inputFrames / fmt.sampleRate,
  };
}

/** Parse the RIFF/RF64 chunk list up to the `data` chunk. */
export async function readWavFormat(file: File): Promise<WavFormat> {
  const header = new DataView(await file.slice(0, 12).arrayBuffer());
  const riff = fourCC(header, 0);
  if ((riff !== 'RIFF' && riff !== 'RF64') || fourCC(header, 8) !== 'WAVE') {
    throw new Error('Not a RIFF/WAVE file');
  }

  let fmt: Omit<WavFormat, 'dataOffset' | 'dataSize'> | null = null;
  let pos = 12;
  while (pos + 8 <= file.size) {
    const chunk = new DataView(await file.slice(pos, pos + 8).arrayBuffer());
    const id = fourCC(chunk, 0);
    const size = chunk.getUint32(4, true);
    const bodyStart = pos + 8;

    if (id === 'fmt ') {
      const body = new DataView(await file.slice(bodyStart, bodyStart + Math.min(size, 40)).arrayBuffer());
      let format = body.getUint16(0, true);
      if (format === WAVE_FORMAT_EXTENSIBLE && body.byteLength >= 26) {
        format = body.getUint16(24, true); // first two bytes of the SubFormat GUID
      }
      fmt = {
        format,
        channels: body.getUint16(2, true),
        sampleRate: body.getUint32(4, true),
        bitsPerSample: body.getUint16(14, true),
      };
    } else if (id === 'data') {
      if (!fmt) throw new Error('WAV data chunk before fmt chunk');
      // RF64 / streamed recordings store 0xFFFFFFFF (or a too-large size): use the rest of the file.
      const available = file.size - bodyStart;
      const dataSize = size === 0xffffffff || size === 0 || size > available ? available : size;
      validateFormat(fmt);
      return { ...fmt, dataOffset: bodyStart, dataSize };
    }

    pos = bodyStart + size + (size % 2); // chunks are word-aligned
  }
  throw new Error('WAV file has no data chunk');
}

function validateFormat(fmt: Omit<WavFormat, 'dataOffset' | 'dataSize'>): void {
  const supportedPcm = fmt.format === WAVE_FORMAT_PCM && [16, 24, 32].includes(fmt.bitsPerSample);
  const supportedFloat = fmt.format === WAVE_FORMAT_IEEE_FLOAT && [32, 64].includes(fmt.bitsPerSample);
  if (!supportedPcm && !supportedFloat) {
    throw new Error(`Unsupported WAV encoding (format ${fmt.format}, ${fmt.bitsPerSample}-bit)`);
  }
  if (fmt.channels < 1 || fmt.sampleRate < 8000) {
    throw new Error('Unsupported WAV channel count or sample rate');
  }
}

/** Returns a reader that decodes one sample at a byte offset to a float in −1…1. */
function sampleReader(fmt: WavFormat): (view: DataView, offset: number) => number {
  if (fmt.format === WAVE_FORMAT_IEEE_FLOAT) {
    return fmt.bitsPerSample === 64
      ? (v, o) => v.getFloat64(o, true)
      : (v, o) => v.getFloat32(o, true);
  }
  switch (fmt.bitsPerSample) {
    case 16:
      return (v, o) => v.getInt16(o, true) / 0x8000;
    case 24:
      return (v, o) => ((v.getUint8(o) | (v.getUint8(o + 1) << 8) | (v.getInt8(o + 2) << 16))) / 0x800000;
    default:
      return (v, o) => v.getInt32(o, true) / 0x80000000;
  }
}

function fourCC(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3)
  );
}

function pushMp3(parts: ArrayBuffer[], encoded: Uint8Array): void {
  if (encoded.length > 0) {
    parts.push(encoded.slice().buffer as ArrayBuffer);
  }
}

/** Yield control back to the browser event loop to avoid blocking the UI. */
function yieldToMain(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}
