import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import OpenAI from 'openai';
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

  const client = new OpenAI({
    baseURL: process.env.AZURE_FOUNDRY_ENDPOINT!,
    apiKey: process.env.AZURE_FOUNDRY_API_KEY!,
  });

  // AI 2: JSON generator — build messages with full context
  const characterPreamble: { role: 'user' | 'assistant'; content: string }[] = [
    { role: 'user', content: `Huidig karakter:\n${JSON.stringify(currentCharacter)}` },
    { role: 'assistant', content: 'Karakter ontvangen, zal het inlezen.' },
  ];

  const response = await client.chat.completions.create({
    model: 'gpt-5-mini',
    max_completion_tokens: 4096,
    messages: [
      { role: 'system', content: CHARACTER_JSON_GENERATOR_PROMPT },
      ...characterPreamble,
      ...chatHistory,
      { role: 'assistant', content: ai1Response },
      { role: 'user', content: 'Update het karakter op basis van het bovenstaande gesprek. Retourneer alleen een geldig JSON-object.' },
    ],
  });

  const text = response.choices[0]?.message?.content;

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
    secrets: ['AZURE_FOUNDRY_API_KEY', 'AZURE_FOUNDRY_ENDPOINT'],
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

    await versionsRef.add({
      id: db.collection('_').doc().id, // auto-generated ID
      versionNumber: nextNumber,
      character,
      commitMessage: 'Draft via AI chat',
      source: 'ai',
      isDraft: true,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
}
