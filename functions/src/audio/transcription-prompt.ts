import {RAW_STORY_TRANSCRIPTION_PROMPT} from '../prompts/raw-story-transcription.prompt';
import {KankaSearchResult} from '../types/audio-session.types';

export function buildRawStoryPrompt(
  kankaContext?: KankaSearchResult
): string {
  if (!kankaContext || Object.keys(kankaContext).length === 0) {
    return RAW_STORY_TRANSCRIPTION_PROMPT;
  }

  const contextPrompt = buildKankaContextPrompt(kankaContext);
  if (!contextPrompt) {
    return RAW_STORY_TRANSCRIPTION_PROMPT;
  }

  return `${RAW_STORY_TRANSCRIPTION_PROMPT}\n\n${contextPrompt}`;
}

function buildKankaContextPrompt(context: KankaSearchResult): string {
  const sections: string[] = [];

  const addSection = (
    label: string,
    entities:
      | Array<{name: string; entry?: string; entry_parsed?: string}>
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

  if (context.journals?.length) {
    const journalEntries = context.journals
      .filter(j => j.name && j.entry_parsed)
      .map(j => {
        const date = j.date ? ` (${j.date})` : '';
        return `- ${j.name}${date}: ${j.entry_parsed}`;
      })
      .join('\n');
    if (journalEntries) {
      sections.push(`Journals:\n${journalEntries}`);
    }
  }

  if (sections.length === 0) {
    return '';
  }

  return `CAMPAIGN REFERENCE (for name/place accuracy only):
${sections.join('\n')}

Remember: Use this context ONLY to spell names and places correctly when you hear them. Do not add information that wasn't spoken.`;
}
