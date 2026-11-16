import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { DndCharacterSchema, DndCharacter } from './schemas/dnd-character.schema';
import { characterJsonGeneratorPrompt } from './prompts/character-json-generator.prompt';
import { readRulesVersion, RulesVersion } from './character/rules-version';
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

/** The line in the version history is one sentence; a longer one is cut off. */
const MAX_SUMMARY_LENGTH = 160;

/** Shown in the version history when the generator left its summary out. */
const FALLBACK_COMMIT_MESSAGE = 'Updated via AI chat';

export interface GenerateCharacterDraftPayload {
  characterId: string;
  currentCharacter: DndCharacter;
  /**
   * The rules the new version is built under and marked with. Left out, it keeps the
   * rules of the current character.
   */
  rulesVersion?: RulesVersion;
  chatHistory: ChatHistoryMessage[];
  ai1Response: string;
  pdfAttachment?: { mimeType: string; data: string };
}

/** The version a generated character was stored as. It is the active version from then on. */
export interface SavedVersion {
  versionId: string;
  versionNumber: number;
  /** The version that was active until now: where an undo goes back to. Null when there was none. */
  previousVersionId: string | null;
  /** Ability score rule violations the generator could not fix. */
  abilityScoreWarnings: string[];
}

export interface GenerateCharacterDraftOptions {
  /** Asked right before saving; `false` drops the generated character (the owner cancelled the update). */
  shouldSave?: () => Promise<boolean>;
}

/**
 * Core logic for AI 2: generates the updated character from chat context and stores it
 * as a new version, which becomes the active one. The character it starts from is the
 * one in the payload (the version the owner has active), so a change made on an older
 * version builds on that version. Run by the chat worker, for a turn whose sender was
 * checked to own the character. Returns the saved version, or null when `shouldSave`
 * turned it down.
 */
export async function executeGenerateCharacterDraft(
  payload: GenerateCharacterDraftPayload,
  options: GenerateCharacterDraftOptions = {}
): Promise<SavedVersion | null> {
  const { characterId, currentCharacter, chatHistory, ai1Response, pdfAttachment } = payload;
  const rulesVersion = payload.rulesVersion ?? readRulesVersion(currentCharacter?.rulesVersion);

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
    rulesVersion,
    contentPartsCount: contentParts.length,
    characterId,
  });

  let result: GeneratedDraft;
  try {
    const generate = async (parts: ContentPart[]): Promise<GeneratedDraft> => {
      let parsed: unknown;
      try {
        parsed = await generateJson<unknown>(
          {
            config,
            label: 'generateCharacterDraft',
            contents: parts,
            systemInstruction: characterJsonGeneratorPrompt(rulesVersion),
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
      const answer = splitAnswer(parsed);
      // The rules are not the generator's to choose: the character gets the ones it was built under.
      const draft = DndCharacterSchema.parse(withRulesVersion(answer.character, rulesVersion));
      return { ...checkAbilityScores(preserveLimitedUses(currentCharacter, draft)), summary: answer.summary };
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
    logger.warn('generateCharacterDraft: ability score issues remain, saving the version with warnings', {
      characterId,
      issues: result.issues.map(issue => issue.code),
    });
  }

  if (options.shouldSave && !(await options.shouldSave())) {
    logger.info('generateCharacterDraft: character dropped, the update was cancelled', { characterId });
    return null;
  }

  logger.info('generateCharacterDraft: saving the new version');
  return saveVersion(characterId, result.character, result.summary ?? FALLBACK_COMMIT_MESSAGE, {
    abilityScoreWarnings: result.issues.map(issue => issue.message),
    derivedStatCorrections: result.corrections,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The generator answers with `{ summary, character }`. An answer that is the bare
 * character is taken as such, without a summary.
 */
function splitAnswer(parsed: unknown): { character: unknown; summary: string | null } {
  if (isRecord(parsed) && isRecord(parsed.character)) {
    return { character: parsed.character, summary: cleanSummary(parsed.summary) };
  }
  return { character: parsed, summary: null };
}

/** One line of plain text, or null when there is nothing usable. */
function cleanSummary(summary: unknown): string | null {
  if (typeof summary !== 'string') return null;
  const line = summary.replace(/\s+/g, ' ').trim();
  if (!line) return null;
  return line.length > MAX_SUMMARY_LENGTH ? `${line.slice(0, MAX_SUMMARY_LENGTH - 1).trimEnd()}…` : line;
}

function withRulesVersion(generated: unknown, rulesVersion: RulesVersion): unknown {
  return isRecord(generated) ? { ...generated, rulesVersion } : generated;
}

type ContentPart = { text: string } | { inlineData: { mimeType: string; data: string } };

interface CheckedDraft {
  character: DndCharacter;
  issues: AbilityScoreIssue[];
  /** Values that were recalculated, e.g. "Initiative +4 -> +2". */
  corrections: string[];
}

/** A checked character with the generator's one-sentence summary of what changed. */
interface GeneratedDraft extends CheckedDraft {
  summary: string | null;
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

/**
 * Store the character as the next version and make it the active one, in one go: the
 * number follows the newest version, whichever version the change started from.
 */
async function saveVersion(
  characterId: string,
  character: DndCharacter,
  commitMessage: string,
  checks: DraftCheckResults
): Promise<SavedVersion> {
  const db = getFirestore();
  const characterRef = db.collection('characters').doc(characterId);
  const versionsRef = characterRef.collection('versions');
  const versionRef = versionsRef.doc();

  return db.runTransaction(async tx => {
    const characterSnap = await tx.get(characterRef);
    const newestSnap = await tx.get(versionsRef.orderBy('versionNumber', 'desc').limit(1));

    const versionNumber = newestSnap.empty ? 1 : newestSnap.docs[0].data().versionNumber + 1;
    const active: unknown = characterSnap.get('activeVersionId');
    const now = FieldValue.serverTimestamp();

    tx.set(versionRef, {
      id: versionRef.id,
      versionNumber,
      character,
      ...checks,
      commitMessage,
      source: 'ai',
      createdAt: now,
    });
    tx.update(characterRef, { activeVersionId: versionRef.id, updatedAt: now });

    return {
      versionId: versionRef.id,
      versionNumber,
      previousVersionId: typeof active === 'string' && active ? active : null,
      abilityScoreWarnings: checks.abilityScoreWarnings,
    };
  });
}
