import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { GoogleGenAI } from '@google/genai';
import { getStorage } from 'firebase-admin/storage';
import * as logger from '../utils/logger';
import { TranscriptionSegmentationSettings } from '../types/audio-session.types';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/**
 * The session's processed recording (compressed + normalized MP3) as stored in
 * Firebase Storage by the frontend. Lets a session be re-listened to and
 * re-transcribed without uploading the audio again.
 */
export interface AudioRecording {
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  durationSec: number;
  uploadedAt: string;
}

/** A time range within the recording, in seconds. */
export interface SegmentRange {
  startSec: number;
  endSec: number;
}

/** A segment uploaded to the Gemini Files API, ready for transcription. */
export interface PreparedSegment extends SegmentRange {
  index: number;
  fileUri: string;
}

/** Storage path a session's recording must live under (checked before reading it). */
export function sessionAudioPrefix(campaignId: string, sessionId: string): string {
  return `campaigns/${campaignId}/audio/${sessionId}/`;
}

/**
 * Split a recording into overlapping segment ranges (ticket #67). Recordings at
 * or below `minSplitMinutes` — or any recording when segmentation is disabled —
 * stay a single segment. Each segment after the first starts `overlapSeconds`
 * early so words on the boundary aren't clipped.
 */
export function computeSegmentRanges(
  durationSec: number,
  cfg: Pick<TranscriptionSegmentationSettings, 'enabled' | 'segmentMinutes' | 'overlapSeconds' | 'minSplitMinutes'>
): SegmentRange[] {
  const segmentSec = cfg.segmentMinutes * 60;
  if (!cfg.enabled || durationSec <= cfg.minSplitMinutes * 60 || segmentSec <= 0) {
    return [{ startSec: 0, endSec: durationSec }];
  }

  const ranges: SegmentRange[] = [];
  const count = Math.ceil(durationSec / segmentSec);
  for (let k = 0; k < count; k++) {
    const startSec = Math.max(0, k * segmentSec - (k > 0 ? cfg.overlapSeconds : 0));
    const endSec = Math.min(durationSec, (k + 1) * segmentSec);
    ranges.push({ startSec, endSec });
  }
  return ranges;
}

/**
 * Download the stored recording, cut it into segments and upload each one to
 * the Gemini Files API. Segments are cut with stream copy (no re-encode), so the
 * audio Gemini hears is exactly what was stored. The temp directory is removed
 * once all segments are uploaded.
 */
export async function prepareSegmentsFromStorage(
  googleAi: GoogleGenAI,
  recording: AudioRecording,
  segmentation: TranscriptionSegmentationSettings,
  onSegmentUploaded?: (uploaded: number, total: number) => Promise<void> | void
): Promise<PreparedSegment[]> {
  const workDir = await fs.mkdtemp(join(tmpdir(), 'session-audio-'));
  const sourcePath = join(workDir, 'source.mp3');

  try {
    await getStorage().bucket().file(recording.storagePath).download({ destination: sourcePath });

    // A missing duration (shouldn't happen) degrades to one segment over the whole file.
    const durationSec = recording.durationSec > 0 ? recording.durationSec : Number.POSITIVE_INFINITY;
    const ranges = Number.isFinite(durationSec)
      ? computeSegmentRanges(durationSec, segmentation)
      : [{ startSec: 0, endSec: 0 }];
    const baseName = recording.fileName.replace(/\.[^/.]+$/, '');

    logger.debug(`[Stored Audio] Preparing ${ranges.length} segment(s) from ${recording.storagePath}`);

    // Cut every segment first (stream copy, fast), then upload them in parallel
    // so preparation doesn't eat into the worker's time budget.
    const single = ranges.length === 1;
    const segmentPaths: string[] = [];
    for (let i = 0; i < ranges.length; i++) {
      const { startSec, endSec } = ranges[i];
      const segmentPath = single ? sourcePath : join(workDir, `part${i + 1}.mp3`);
      if (!single) {
        await cutSegment(sourcePath, segmentPath, startSec, endSec - startSec);
      }
      segmentPaths.push(segmentPath);
    }

    let uploaded = 0;
    const segments = await Promise.all(ranges.map(async ({ startSec, endSec }, i): Promise<PreparedSegment> => {
      const file = await googleAi.files.upload({
        file: segmentPaths[i],
        config: {
          mimeType: recording.mimeType || 'audio/mpeg',
          displayName: single ? `${baseName}.mp3` : `${baseName}-part${i + 1}.mp3`,
        },
      });
      if (!file.uri) {
        throw new Error(`Gemini upload of segment ${i + 1} returned no file URI`);
      }
      uploaded += 1;
      await onSegmentUploaded?.(uploaded, ranges.length);
      return { index: i, fileUri: file.uri, startSec, endSec: single ? recording.durationSec : endSec };
    }));

    return segments;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

/** Cut [startSec, startSec + durationSec) out of an MP3 without re-encoding. */
function cutSegment(input: string, output: string, startSec: number, durationSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .setStartTime(startSec)
      .setDuration(durationSec)
      .audioCodec('copy')
      .format('mp3')
      .on('end', () => resolve())
      .on('error', reject)
      .save(output);
  });
}
