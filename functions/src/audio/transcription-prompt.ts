import {
  RAW_STORY_TRANSCRIPTION_PROMPT,
  buildSegmentTranscriptionPrompt,
  SegmentPromptMeta,
} from '../prompts/raw-story-transcription.prompt';
import {KankaSearchResult} from '../types/audio-session.types';

export function buildRawStoryPrompt(
  kankaContext?: KankaSearchResult
): string {
  return appendKankaContext(RAW_STORY_TRANSCRIPTION_PROMPT, kankaContext);
}

/**
 * Build the transcription prompt for one time-segment of a longer session,
 * with the same Kanka name/place reference appended for accuracy.
 */
export function buildSegmentRawStoryPrompt(
  meta: SegmentPromptMeta,
  kankaContext?: KankaSearchResult
): string {
  return appendKankaContext(buildSegmentTranscriptionPrompt(meta), kankaContext);
}

function appendKankaContext(
  basePrompt: string,
  kankaContext?: KankaSearchResult
): string {
  if (!kankaContext || Object.keys(kankaContext).length === 0) {
    return basePrompt;
  }

  const contextPrompt = buildKankaContextPrompt(kankaContext);
  if (!contextPrompt) {
    return basePrompt;
  }

  return `${basePrompt}\n\n${contextPrompt}`;
}

function buildKankaContextPrompt(context: KankaSearchResult): string {
  const sections: string[] = [];

  const addSection = (
    label: string,
    entities:
      | {name: string; entry?: string; entry_parsed?: string}[]
      | undefined
  ) => {
    if (!entities?.length) {
      return;
    }
    const names = entities
      .map(entity => entity.name)
      .filter(Boolean)
      .join(', ');
    if (names) {
      sections.push(`${label}: ${names}`);
    }
  };

  addSection('Characters', context.characters);
  addSection('Locations', context.locations);
  addSection('Quests', context.quests);
  addSection('Organisations', context.organisations);

  if (sections.length === 0) {
    return '';
  }

  return `CAMPAIGN REFERENCE (for name/place accuracy only):
${sections.join('\n')}

Remember: Use this context ONLY to spell names and places correctly when you hear them. Do not add information that wasn't spoken.`;
}
