import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getFunctions } from 'firebase-admin/functions';
import OpenAI from 'openai';
import { wrapCallable } from './utils/sentry-error-handler';
import { SHARED_CORS } from './index';
import { CHARACTER_RESPONDER_PROMPT } from './prompts/character-responder.prompt';
import { DndCharacter } from './schemas/dnd-character.schema';

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

      const client = new OpenAI({
        baseURL: process.env.AZURE_FOUNDRY_ENDPOINT!,
        apiKey: process.env.AZURE_FOUNDRY_API_KEY!,
      });

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
        throw new HttpsError('internal', 'No response from AI model');
      }

      // Enqueue Cloud Task for AI 2 (generateCharacterDraft)
      // Fire-and-forget: don't await, don't block the response
      const queue = getFunctions().taskQueue('generateCharacterDraft');
      queue.enqueue({
        characterId,
        currentCharacter,
        chatHistory,
        ai1Response: text,
      }).catch(err => {
        console.error('Failed to enqueue generateCharacterDraft task:', err);
      });

      return { text };
    }
  )
);
