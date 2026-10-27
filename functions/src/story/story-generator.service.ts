import * as logger from '../utils/logger';
import { generateText } from '../utils/gemini-client';
import { buildKankaContextBlock } from '../services/kanka.service';
import { AIFeatureConfig, KankaSearchResult, PreviousStory } from '../types/audio-session.types';
import { SESSION_STORY_GENERATOR_PROMPT } from '../prompts/session-story-generator.prompt';

/**
 * Generates a polished story from the annotated session log
 *
 * @param rawStory - Annotated session log from transcription (older sessions: a raw narrative)
 * @param config - AI model configuration
 * @param kankaContext - Optional campaign context for accuracy
 * @param userCorrections - Optional DM corrections to apply
 * @param previousStories - Optional previous session stories for flashbacks/memories
 * @returns Generated story content
 */
export async function generateStoryFromTranscription(
  rawStory: string,
  config: AIFeatureConfig,
  kankaContext?: KankaSearchResult,
  userCorrections?: string,
  previousStories?: PreviousStory[]
): Promise<string> {
  logger.debug(`Generating story with ${config.model}...`);

  const storyContent = await generateText({
    config,
    label: 'generateStory',
    contents: [{ role: 'user', parts: [{ text: buildStoryPrompt(rawStory, kankaContext, userCorrections, previousStories) }] }],
  });

  logger.debug(`Story generated: ${storyContent.length} characters`);

  return storyContent;
}

/**
 * Builds story generation prompt with context and corrections
 */
function buildStoryPrompt(
  rawStory: string,
  kankaContext?: KankaSearchResult,
  userCorrections?: string,
  previousStories?: PreviousStory[]
): string {
  let prompt = SESSION_STORY_GENERATOR_PROMPT;

  const contextPrompt = buildKankaContextBlock(kankaContext);
  if (contextPrompt) {
    prompt += `\n\n${contextPrompt}`;
  }

  if (previousStories && previousStories.length > 0) {
    const storySummaries = previousStories
      .map(s => `### ${s.title} (${s.sessionDate})\n${s.content}`)
      .join('\n\n---\n\n');

    prompt += `\n\nPREVIOUS SESSION STORIES (for reference and flashbacks):
The following are recaps of earlier sessions in chronological order.
You may subtly reference these events as flashbacks, memories, or callbacks when relevant to the current session.

${storySummaries}`;
  }

  if (userCorrections && userCorrections.trim().length > 0) {
    prompt += `\n\nDM CORRECTIONS:\n${userCorrections}`;
  }

  prompt += `\n\nSESSION LOG:\n${rawStory}`;

  return prompt;
}
