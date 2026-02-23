import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';
import { DndCharacterSchema, DndCharacter } from './schemas/dnd-character.schema';
import { CHARACTER_JSON_GENERATOR_PROMPT } from './prompts/character-json-generator.prompt';
import { captureFunctionError, wrapCallable } from './utils/sentry-error-handler';
import { getAiFeatureConfig } from './utils/ai-settings';
import { SHARED_CORS } from './index';
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
 * Core logic for AI 2: generates a character draft from chat context.
 * Extracted so it can be called both from Cloud Tasks and directly as fallback.
 */
export async function executeGenerateCharacterDraft(payload: GenerateCharacterDraftPayload): Promise<void> {
  const { characterId, currentCharacter, chatHistory, ai1Response, pdfAttachment } = payload;

  if (!characterId || !currentCharacter || !chatHistory || !ai1Response) {
    logger.error('generateCharacterDraft: missing required payload fields');
    return;
  }

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('Google AI API key not configured');
  }

  const ai = new GoogleGenAI({ apiKey });
  const config = await getAiFeatureConfig('characterDraft');

  // AI 2: JSON generator — build messages with full context
  const conversationText = [
    `Huidig karakter:\n${JSON.stringify(currentCharacter)}`,
    ...chatHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`),
    `Assistant: ${ai1Response}`,
    'Update het karakter op basis van het bovenstaande gesprek. Retourneer alleen een geldig JSON-object.',
  ].join('\n\n');

  // Build content parts — include PDF as inline data when available for accurate extraction
  const contentParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: conversationText },
  ];

  if (pdfAttachment) {
    contentParts.push({
      inlineData: { mimeType: pdfAttachment.mimeType, data: pdfAttachment.data },
    });
  }

  const response = await ai.models.generateContent({
    model: config.model,
    contents: contentParts,
    config: {
      systemInstruction: CHARACTER_JSON_GENERATOR_PROMPT,
      responseMimeType: 'application/json',
      maxOutputTokens: config.maxOutputTokens,
      temperature: config.temperature,
    },
  });

  // Clear the generating flag so the frontend hides the loader
  const db = getFirestore();
  await db.collection('characters').doc(characterId).update({ isGenerating: false });

  const text = response.text ?? '';

  if (!text) {
    throw new Error('No response from AI model');
  }

  // Parse and validate JSON
  const parsed = JSON.parse(text);
  const validatedCharacter = DndCharacterSchema.parse(parsed);

  // Save as draft version in Firestore
  await saveDraftVersion(characterId, validatedCharacter);
}

export const generateCharacterDraft = onTaskDispatched(
  {
    secrets: ['GOOGLE_AI_API_KEY'],
    retryConfig: {
      maxAttempts: 3,
    },
  },
  async (request) => {
    try {
      await executeGenerateCharacterDraft(request.data as GenerateCharacterDraftPayload);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      captureFunctionError('generateCharacterDraft', err);

      // Clear the generating flag so the user isn't stuck with a permanent loader
      const payload = request.data as GenerateCharacterDraftPayload;
      if (payload.characterId) {
        const db = getFirestore();
        await db.collection('characters').doc(payload.characterId).update({ isGenerating: false, isUpdating: false }).catch(() => {});
      }

      throw err; // Re-throw so Cloud Tasks can retry
    }
  }
);

/**
 * Callable endpoint for AI 2: allows the frontend to trigger character draft generation directly.
 */
export const generateCharacterDraftCallable = onCall(
  {
    cors: SHARED_CORS,
    secrets: ['GOOGLE_AI_API_KEY'],
    timeoutSeconds: 120,
  },
  wrapCallable<GenerateCharacterDraftPayload, { success: boolean }>(
    'generateCharacterDraftCallable',
    async (request): Promise<{ success: boolean }> => {
      if (!request.auth?.uid) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      const payload = request.data;

      if (!payload.characterId || !payload.currentCharacter || !payload.chatHistory || !payload.ai1Response) {
        throw new HttpsError('invalid-argument', 'Missing required fields: characterId, currentCharacter, chatHistory, ai1Response');
      }

      const db = getFirestore();
      await db.collection('characters').doc(payload.characterId).update({ isGenerating: true });

      try {
        await executeGenerateCharacterDraft(payload);
        return { success: true };
      } catch (error) {
        await db.collection('characters').doc(payload.characterId)
          .update({ isGenerating: false }).catch(() => {});
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
