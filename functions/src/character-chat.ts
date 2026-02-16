import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getFunctions } from 'firebase-admin/functions';
import OpenAI from 'openai';
import { wrapCallable } from './utils/sentry-error-handler';
import { SHARED_CORS } from './index';
import { CHARACTER_RESPONDER_PROMPT } from './prompts/character-responder.prompt';
import { DndCharacter } from './schemas/dnd-character.schema';
import { executeGenerateCharacterDraft } from './generate-character-draft';

interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CharacterChatRequest {
  characterId: string;
  currentCharacter: DndCharacter;
  chatHistory: ChatHistoryMessage[];
}

export interface CharacterChatResponse {
  text: string;
}

export const characterChat = onCall(
  {
    cors: SHARED_CORS,
    secrets: ['AZURE_FOUNDRY_API_KEY', 'AZURE_FOUNDRY_ENDPOINT'],
  },
  wrapCallable<CharacterChatRequest, CharacterChatResponse>(
    'characterChat',
    async (request): Promise<CharacterChatResponse> => {
      const { characterId, currentCharacter, chatHistory } = request.data;

      if (!characterId || !currentCharacter || !Array.isArray(chatHistory) || chatHistory.length === 0) {
        throw new HttpsError('invalid-argument', 'Missing required fields: characterId, currentCharacter, chatHistory');
      }

      const baseURL = process.env.AZURE_FOUNDRY_ENDPOINT;
      const apiKey = process.env.AZURE_FOUNDRY_API_KEY;

      if (!baseURL || !apiKey) {
        console.error('Missing Azure Foundry credentials. AZURE_FOUNDRY_ENDPOINT:', baseURL ? 'set' : 'MISSING', 'AZURE_FOUNDRY_API_KEY:', apiKey ? 'set' : 'MISSING');
        throw new HttpsError('internal', 'AI service not configured');
      }

      const client = new OpenAI({ baseURL, apiKey });

      // AI 1: Text responder — build messages with character context
      const characterPreamble: { role: 'user' | 'assistant'; content: string }[] = [
        { role: 'user', content: `Huidig karakter:\n${JSON.stringify(currentCharacter)}` },
        { role: 'assistant', content: 'Karakter ontvangen, zal het inlezen.' },
      ];

      const response = await client.chat.completions.create({
        model: 'gpt-5-mini',
        max_completion_tokens: 1024,
        messages: [
          { role: 'system', content: CHARACTER_RESPONDER_PROMPT },
          ...characterPreamble,
          ...chatHistory,
        ],
      });

      const text = response.choices[0]?.message?.content;

      if (!text) {
        console.error('AI model returned empty response. Choices:', JSON.stringify(response.choices));
        throw new HttpsError('internal', 'No response from AI model');
      }

      // Enqueue Cloud Task for AI 2 (generateCharacterDraft)
      // Fire-and-forget: don't await, don't block the response
      const payload = { characterId, currentCharacter, chatHistory, ai1Response: text };
      const queue = getFunctions().taskQueue('generateCharacterDraft');
      queue.enqueue(payload).catch(err => {
        console.warn('Cloud Tasks enqueue failed (expected locally), falling back to direct execution:', err.message);
        // Fallback: run directly when Cloud Tasks is unavailable (e.g. local emulator)
        executeGenerateCharacterDraft(payload).catch(directErr => {
          console.error('Direct generateCharacterDraft execution also failed:', directErr);
        });
      });

      return { text };
    }
  )
);
