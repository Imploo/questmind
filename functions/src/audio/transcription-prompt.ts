import {
  buildFullTranscriptionPrompt,
  buildSegmentTranscriptionPrompt,
  SegmentPromptMeta,
  TranscriptionPromptOptions,
} from '../prompts/raw-story-transcription.prompt';
import {KankaSearchResult} from '../types/audio-session.types';
import {buildKankaContextBlock} from '../services/kanka.service';

export function buildRawStoryPrompt(
  kankaContext?: KankaSearchResult,
  options: TranscriptionPromptOptions = {}
): string {
  return appendKankaContext(buildFullTranscriptionPrompt(options), kankaContext);
}

/**
 * Build the transcription prompt for one time-segment of a longer session,
 * with the same Kanka name/place reference appended for accuracy.
 */
export function buildSegmentRawStoryPrompt(
  meta: SegmentPromptMeta,
  kankaContext?: KankaSearchResult,
  options: TranscriptionPromptOptions = {}
): string {
  return appendKankaContext(buildSegmentTranscriptionPrompt(meta, options), kankaContext);
}

function appendKankaContext(
  basePrompt: string,
  kankaContext?: KankaSearchResult
): string {
  const contextPrompt = buildKankaContextBlock(kankaContext);
  return contextPrompt ? `${basePrompt}\n\n${contextPrompt}` : basePrompt;
}
