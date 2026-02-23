import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getFunctions } from 'firebase-admin/functions';
import { getFirestore } from 'firebase-admin/firestore';
import { Anthropic, RateLimitError } from '@anthropic-ai/sdk';
import { wrapCallable } from './utils/sentry-error-handler';
import { getAiFeatureConfig } from './utils/ai-settings';
import { SHARED_CORS } from './index';
import { CHARACTER_RESPONDER_PROMPT } from './prompts/character-responder.prompt';
import { DndCharacter } from './schemas/dnd-character.schema';
import { executeGenerateCharacterDraft } from './generate-character-draft';
import * as logger from './utils/logger';
import { ChatHistoryMessage } from './types/chat.types';

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
    secrets: ['CLAUDE_API_KEY', 'GOOGLE_AI_API_KEY'],
  },
  wrapCallable<CharacterChatRequest, CharacterChatResponse>(
    'characterChat',
    async (request): Promise<CharacterChatResponse> => {
      if (!request.auth?.uid) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      const { characterId, currentCharacter, chatHistory } = request.data;

      if (!characterId || !currentCharacter || !Array.isArray(chatHistory) || chatHistory.length === 0) {
        throw new HttpsError('invalid-argument', 'Missing required fields: characterId, currentCharacter, chatHistory');
      }

      const apiKey = process.env.CLAUDE_API_KEY;

      if (!apiKey) {
        logger.error('Missing CLAUDE_API_KEY');
        throw new HttpsError('internal', 'AI service not configured');
      }

      const client = new Anthropic({ apiKey });
      const config = await getAiFeatureConfig('characterChatText');

      // AI 1: Text responder — build messages with character context
      const characterPreamble: { role: 'user' | 'assistant'; content: string }[] = [
        { role: 'user', content: `Huidig karakter:\n${JSON.stringify(currentCharacter)}` },
        { role: 'assistant', content: 'Karakter ontvangen, zal het inlezen.' },
      ];

      try {
        const response = await client.messages.create({
          model: config.model,
          max_tokens: config.maxOutputTokens,
          system: CHARACTER_RESPONDER_PROMPT,
          messages: [
            ...characterPreamble,
            ...chatHistory,
          ],
        });

        const textBlock = response.content.find(block => block.type === 'text');
        const text = textBlock && 'text' in textBlock ? textBlock.text : null;

        if (!text) {
          logger.error('AI model returned empty response. Content:', JSON.stringify(response.content));
          throw new HttpsError('internal', 'No response from AI model');
        }

        // Mark character as generating before enqueuing AI 2
        const db = getFirestore();
        db.collection('characters').doc(characterId).update({ isGenerating: true }).catch(err => {
          logger.warn('Failed to set isGenerating flag: ' + err.message);
        });

        // Enqueue Cloud Task for AI 2 (generateCharacterDraft)
        // Fire-and-forget: don't await, don't block the response
        const payload = { characterId, currentCharacter, chatHistory, ai1Response: text };
        const queue = getFunctions().taskQueue('locations/europe-west1/functions/generateCharacterDraft');
        queue.enqueue(payload).catch(err => {
          logger.warn('Cloud Tasks enqueue failed (expected locally), falling back to direct execution: ' + err.message);
          // Fallback: run directly when Cloud Tasks is unavailable (e.g. local emulator)
          executeGenerateCharacterDraft(payload).catch(directErr => {
            logger.error('Direct generateCharacterDraft execution also failed:', directErr);
          });
        });

        return { text };
      } catch (error) {
        if (error instanceof RateLimitError) {
          throw new HttpsError('resource-exhausted', 'Rate limit exceeded. Please wait a moment before trying again.');
        }
        throw error;
      }
    }
  )
);
