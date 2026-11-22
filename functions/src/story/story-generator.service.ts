import * as logger from '../utils/logger';
import { generateText } from '../utils/gemini-client';
import { buildKankaContextBlock } from '../services/kanka.service';
import { AIFeatureConfig, KankaSearchResult, PreviousStory } from '../types/audio-session.types';
import { SESSION_STORY_GENERATOR_PROMPT, buildPreviousVersionBlock } from '../prompts/session-story-generator.prompt';

/** The story as it stands, when the DM edited it by hand (see buildPreviousVersionBlock). */
export interface PreviousStoryVersion {
  content: string;
  /** The session was transcribed again after this version was written */
  logRenewed: boolean;
}

/** Everything besides the session log that shapes the story. */
export interface StoryContext {
  /** Campaign context for accuracy */
  kankaContext?: KankaSearchResult;
  /** DM corrections to apply */
  userCorrections?: string;
  /** Stories of earlier sessions, for references the log itself makes */
  previousStories?: PreviousStory[];
  /** The current story, when it carries hand-made improvements that must stay */
  previousVersion?: PreviousStoryVersion;
}

/**
 * Generates a polished story from the annotated session log
 *
 * @param rawStory - Annotated session log from transcription (older sessions: a raw narrative)
 * @param config - AI model configuration
 * @param context - Campaign context, corrections, earlier sessions and the hand-edited previous version
 * @returns Generated story content
 */
export async function generateStoryFromTranscription(
  rawStory: string,
  config: AIFeatureConfig,
  context: StoryContext = {}
): Promise<string> {
  logger.debug(`Generating story with ${config.model}...`);

  const storyContent = await generateText({
    config,
    label: 'generateStory',
    contents: [{ role: 'user', parts: [{ text: buildStoryPrompt(rawStory, context) }] }],
  });

  logger.debug(`Story generated: ${storyContent.length} characters`);

  return storyContent;
}

/**
 * Builds story generation prompt with context and corrections
 */
export function buildStoryPrompt(rawStory: string, context: StoryContext = {}): string {
  const { kankaContext, userCorrections, previousStories, previousVersion } = context;
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

  if (previousVersion && previousVersion.content.trim().length > 0) {
    prompt += `\n\n${buildPreviousVersionBlock(previousVersion.content.trim(), previousVersion.logRenewed)}`;
  }

  prompt += `\n\nSESSION LOG:\n${rawStory}`;

  return prompt;
}
