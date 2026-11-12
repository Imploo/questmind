import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { DndCharacterSchema, DndCharacter } from './schemas/dnd-character.schema';
import { CHARACTER_JSON_GENERATOR_PROMPT } from './prompts/character-json-generator.prompt';
import { getAiFeatureConfig } from './utils/ai-settings';
import { GeminiEmptyResponseError, generateJson, getGeminiClient } from './utils/gemini-client';
import * as logger from './utils/logger';
import { ChatHistoryMessage } from './types/chat.types';
import {
  AbilityScoreIssue,
  abilityScoresChanged,
  fixAbilityModifiers,
  formatAbilityFeedback,
  validateAbilityScores,
} from './character/ability-score-validation';
import { recalculateDerivedStats } from './character/derived-stats';
import { preserveLimitedUses } from './character/limited-uses';

/** Extra generator calls when the ability scores break the rules. */
const MAX_ABILITY_SCORE_RETRIES = 2;

export interface GenerateCharacterDraftPayload {
  characterId: string;
  currentCharacter: DndCharacter;
  chatHistory: ChatHistoryMessage[];
  ai1Response: string;
  pdfAttachment?: { mimeType: string; data: string };
}

/** The draft version a generated character was stored as. */
export interface SavedDraft {
  versionId: string;
  versionNumber: number;
}

export interface GenerateCharacterDraftOptions {
  /** Asked right before saving; `false` drops the generated draft (the owner cancelled the update). */
  shouldSave?: () => Promise<boolean>;
}

/**
 * Core logic for AI 2: generates a character draft from chat context and stores
 * it as a draft version. Run by the chat worker, for a turn whose sender was checked
 * to own the character. Returns the saved draft, or null when `shouldSave` turned it down.
 */
export async function executeGenerateCharacterDraft(
  payload: GenerateCharacterDraftPayload,
  options: GenerateCharacterDraftOptions = {}
): Promise<SavedDraft | null> {
  const { characterId, currentCharacter, chatHistory, ai1Response, pdfAttachment } = payload;

  if (!characterId || !currentCharacter || !chatHistory || !ai1Response) {
    throw new Error('generateCharacterDraft: missing required payload fields');
  }

  const client = getGeminiClient();
  const config = await getAiFeatureConfig('characterDraft');

  // AI 2: JSON generator — build messages with full context
  const conversationText = [
    `Huidig karakter:\n${JSON.stringify(currentCharacter)}`,
    ...chatHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`),
    `Assistant: ${ai1Response}`,
    'Update het karakter op basis van het bovenstaande gesprek. Retourneer alleen een geldig JSON-object.',
  ].join('\n\n');

  // Build content parts — include PDF as inline data when available for accurate extraction
  const contentParts: ContentPart[] = [
    { text: conversationText },
  ];

  if (pdfAttachment) {
    contentParts.push({
      inlineData: { mimeType: pdfAttachment.mimeType, data: pdfAttachment.data },
    });
  }

  logger.info('generateCharacterDraft: calling Gemini', {
    model: config.model,
    hasPdf: Boolean(pdfAttachment),
    contentPartsCount: contentParts.length,
    characterId,
  });

  let result: CheckedDraft;
  try {
    const generate = async (parts: ContentPart[]): Promise<CheckedDraft> => {
      let parsed: unknown;
      try {
        parsed = await generateJson<unknown>(
          {
            config,
            label: 'generateCharacterDraft',
            contents: parts,
            systemInstruction: CHARACTER_JSON_GENERATOR_PROMPT,
            logContext: { characterId },
          },
          client
        );
      } catch (error) {
        if (error instanceof GeminiEmptyResponseError) {
          throw new Error('No response from AI model');
        }
        throw error;
      }
      logger.info('generateCharacterDraft: JSON parsed successfully, validating schema');
      return checkAbilityScores(preserveLimitedUses(currentCharacter, DndCharacterSchema.parse(parsed)));
    };

    result = await generate(contentParts);

    // Feed rule violations back to the generator, but only when this draft touched the
    // ability scores: an untouched, already-wrong character should not trigger new AI calls.
    for (
      let attempt = 1;
      attempt <= MAX_ABILITY_SCORE_RETRIES && result.issues.length && abilityScoresChanged(currentCharacter, result.character);
      attempt++
    ) {
      logger.info('generateCharacterDraft: ability scores break the rules, asking for a correction', {
        characterId,
        attempt,
        issues: result.issues.map(issue => issue.code),
      });
      result = await generate([
        ...contentParts,
        { text: `Previous JSON:\n${JSON.stringify(result.character)}` },
        { text: formatAbilityFeedback(result.issues) },
      ]);
    }
  } finally {
    // Clear the generating flag so the frontend hides the loader
    await getFirestore().collection('characters').doc(characterId).update({ isGenerating: false });
  }

  if (result.issues.length) {
    logger.warn('generateCharacterDraft: ability score issues remain, saving draft with warnings', {
      characterId,
      issues: result.issues.map(issue => issue.code),
    });
  }

  if (options.shouldSave && !(await options.shouldSave())) {
    logger.info('generateCharacterDraft: draft dropped, the update was cancelled', { characterId });
    return null;
  }

  // Save as draft version in Firestore
  logger.info('generateCharacterDraft: saving draft version');
  return saveDraftVersion(characterId, result.character, {
    abilityScoreWarnings: result.issues.map(issue => issue.message),
    derivedStatCorrections: result.corrections,
  });
}

type ContentPart = { text: string } | { inlineData: { mimeType: string; data: string } };

interface CheckedDraft {
  character: DndCharacter;
  issues: AbilityScoreIssue[];
  /** Values that were recalculated, e.g. "Initiative +4 -> +2". */
  corrections: string[];
}

/**
 * Fix the arithmetic (ability modifiers, then everything derived from them), then
 * report what is still against the ability score rules.
 */
function checkAbilityScores(draft: DndCharacter): CheckedDraft {
  const modifiers = fixAbilityModifiers(draft);
  const derived = recalculateDerivedStats(modifiers.character);
  const corrections = [...modifiers.fixes, ...derived.corrections];
  if (corrections.length) {
    logger.info('generateCharacterDraft: recalculated derived values', { corrections });
  }
  return { character: derived.character, issues: validateAbilityScores(derived.character), corrections };
}

interface DraftCheckResults {
  abilityScoreWarnings: string[];
  derivedStatCorrections: string[];
}

async function saveDraftVersion(
  characterId: string,
  character: DndCharacter,
  checks: DraftCheckResults
): Promise<SavedDraft> {
  const db = getFirestore();
  const versionsRef = db
    .collection('characters').doc(characterId)
    .collection('versions');

  // Single query: get the latest version
  const lastVersionSnap = await versionsRef
    .orderBy('versionNumber', 'desc')
    .limit(1)
    .get();

  if (!lastVersionSnap.empty && lastVersionSnap.docs[0].data().isDraft) {
    // Latest version is already a draft — overwrite it
    const draft = lastVersionSnap.docs[0];
    await draft.ref.update({
      character,
      ...checks,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { versionId: draft.id, versionNumber: draft.data().versionNumber };
  }

  // Create a new draft version
  const nextNumber = lastVersionSnap.empty
    ? 1
    : lastVersionSnap.docs[0].data().versionNumber + 1;

  const newDocRef = versionsRef.doc();
  await newDocRef.set({
    id: newDocRef.id,
    versionNumber: nextNumber,
    character,
    ...checks,
    commitMessage: 'Draft via AI chat',
    source: 'ai',
    isDraft: true,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { versionId: newDocRef.id, versionNumber: nextNumber };
}
