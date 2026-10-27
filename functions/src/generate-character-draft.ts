import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { DndCharacterSchema, DndCharacter } from './schemas/dnd-character.schema';
import { CHARACTER_JSON_GENERATOR_PROMPT } from './prompts/character-json-generator.prompt';
import { wrapCallable } from './utils/sentry-error-handler';
import { getAiFeatureConfig } from './utils/ai-settings';
import { GeminiEmptyResponseError, generateJson, getGeminiClient } from './utils/gemini-client';
import { SHARED_CORS } from './config/cors';
import { ensureAuthForTesting } from './utils/emulator-helpers';
import { assertCharacterOwner, requireAuthUid } from './utils/access';
import * as logger from './utils/logger';
import { ChatHistoryMessage } from './types/chat.types';

export interface GenerateCharacterDraftPayload {
  characterId: string;
  currentCharacter: DndCharacter;
  chatHistory: ChatHistoryMessage[];
  ai1Response: string;
  pdfAttachment?: { mimeType: string; data: string };
}

/**
 * Core logic for AI 2: generates a character draft from chat context and stores
 * it as a draft version. Called by the callable below after its auth/owner checks.
 */
export async function executeGenerateCharacterDraft(payload: GenerateCharacterDraftPayload): Promise<void> {
  const { characterId, currentCharacter, chatHistory, ai1Response, pdfAttachment } = payload;

  if (!characterId || !currentCharacter || !chatHistory || !ai1Response) {
    logger.error('generateCharacterDraft: missing required payload fields');
    return;
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
  const contentParts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [
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

  let parsed: unknown;
  try {
    parsed = await generateJson<unknown>(
      {
        config,
        label: 'generateCharacterDraft',
        contents: contentParts,
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
  } finally {
    // Clear the generating flag so the frontend hides the loader
    await getFirestore().collection('characters').doc(characterId).update({ isGenerating: false });
  }

  logger.info('generateCharacterDraft: JSON parsed successfully, validating schema');
  const validatedCharacter = DndCharacterSchema.parse(parsed);

  // Save as draft version in Firestore
  logger.info('generateCharacterDraft: saving draft version');
  await saveDraftVersion(characterId, validatedCharacter);
}

/**
 * Callable endpoint for AI 2: allows the frontend to trigger character draft generation directly.
 */
export const generateCharacterDraftCallable = onCall(
  {
    cors: SHARED_CORS,
    secrets: ['GOOGLE_AI_API_KEY'],
  },
  wrapCallable<GenerateCharacterDraftPayload, { success: boolean }>(
    'generateCharacterDraftCallable',
    async (request): Promise<{ success: boolean }> => {
      ensureAuthForTesting(request);
      const uid = requireAuthUid(request);

      const payload = request.data;

      if (!payload.characterId || !payload.currentCharacter || !payload.chatHistory || !payload.ai1Response) {
        throw new HttpsError('invalid-argument', 'Missing required fields: characterId, currentCharacter, chatHistory, ai1Response');
      }

      const db = getFirestore();
      await assertCharacterOwner(db, payload.characterId, uid);
      await db.collection('characters').doc(payload.characterId).update({ isGenerating: true });

      try {
        await executeGenerateCharacterDraft(payload);
        return { success: true };
      } catch (error) {
        await db.collection('characters').doc(payload.characterId)
          .update({ isGenerating: false }).catch(() => undefined);
        throw error;
      }
    }
  )
);

async function saveDraftVersion(characterId: string, character: DndCharacter): Promise<void> {
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
    await lastVersionSnap.docs[0].ref.update({
      character,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else {
    // Create a new draft version
    const nextNumber = lastVersionSnap.empty
      ? 1
      : lastVersionSnap.docs[0].data().versionNumber + 1;

    const newDocRef = versionsRef.doc();
    await newDocRef.set({
      id: newDocRef.id,
      versionNumber: nextNumber,
      character,
      commitMessage: 'Draft via AI chat',
      source: 'ai',
      isDraft: true,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
}
