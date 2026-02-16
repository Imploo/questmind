import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';
import { DndCharacterSchema, DndCharacter } from './schemas/dnd-character.schema';
import { CHARACTER_JSON_GENERATOR_PROMPT } from './prompts/character-json-generator.prompt';
import { captureFunctionError } from './utils/sentry-error-handler';

interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateCharacterDraftPayload {
  characterId: string;
  currentCharacter: DndCharacter;
  chatHistory: ChatHistoryMessage[];
  ai1Response: string;
}

/**
 * Core logic for AI 2: generates a character draft from chat context.
 * Extracted so it can be called both from Cloud Tasks and directly as fallback.
 */
export async function executeGenerateCharacterDraft(payload: GenerateCharacterDraftPayload): Promise<void> {
  const { characterId, currentCharacter, chatHistory, ai1Response } = payload;

  if (!characterId || !currentCharacter || !chatHistory || !ai1Response) {
    console.error('generateCharacterDraft: missing required payload fields');
    return;
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! });

  // AI 2: JSON generator — build messages with full context
  const conversationParts = [
    `Huidig karakter:\n${JSON.stringify(currentCharacter)}`,
    ...chatHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`),
    `Assistant: ${ai1Response}`,
    'Update het karakter op basis van het bovenstaande gesprek. Retourneer alleen een geldig JSON-object.',
  ].join('\n\n');

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: conversationParts,
    config: {
      systemInstruction: CHARACTER_JSON_GENERATOR_PROMPT,
      responseMimeType: 'application/json',
      maxOutputTokens: 4096,
      temperature: 0.1,
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
