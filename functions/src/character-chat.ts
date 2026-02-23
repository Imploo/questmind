import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { GoogleGenAI, Part } from '@google/genai';
import { wrapCallable } from './utils/sentry-error-handler';
import { getAiFeatureConfig } from './utils/ai-settings';
import { SHARED_CORS } from './index';
import { CHARACTER_RESPONDER_PROMPT } from './prompts/character-responder.prompt';
import { DndCharacter } from './schemas/dnd-character.schema';
import * as logger from './utils/logger';
import { ChatHistoryMessage, ChatAttachment } from './types/chat.types';

export interface CharacterChatRequest {
  characterId: string;
  currentCharacter: DndCharacter;
  chatHistory: ChatHistoryMessage[];
  attachments?: ChatAttachment[];
}

export interface CharacterChatResponse {
  text: string;
  shouldUpdateCharacter: boolean;
}

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const characterChat = onCall(
  {
    cors: SHARED_CORS,
    secrets: ['GOOGLE_AI_API_KEY'],
  },
  wrapCallable<CharacterChatRequest, CharacterChatResponse>(
    'characterChat',
    async (request): Promise<CharacterChatResponse> => {
      if (!request.auth?.uid) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      const { characterId, currentCharacter, chatHistory, attachments } = request.data;

      if (!characterId || !currentCharacter || !Array.isArray(chatHistory) || chatHistory.length === 0) {
        throw new HttpsError('invalid-argument', 'Missing required fields: characterId, currentCharacter, chatHistory');
      }

      // Validate attachments
      if (attachments?.length) {
        for (const attachment of attachments) {
          const sizeBytes = Buffer.byteLength(attachment.data, 'base64');
          if (sizeBytes > MAX_ATTACHMENT_SIZE_BYTES) {
            throw new HttpsError('invalid-argument', `Attachment "${attachment.fileName}" exceeds 10 MB limit`);
          }
        }
      }

      const apiKey = process.env.GOOGLE_AI_API_KEY;

      if (!apiKey) {
        logger.error('Missing GOOGLE_AI_API_KEY');
        throw new HttpsError('internal', 'AI service not configured');
      }

      const ai = new GoogleGenAI({ apiKey });
      const config = await getAiFeatureConfig('characterChatText');

      // AI 1: Text responder — build Gemini contents with character context
      const contents: Array<{ role: string; parts: Part[] }> = [
        { role: 'user', parts: [{ text: `Huidig karakter:\n${JSON.stringify(currentCharacter)}` }] },
        { role: 'model', parts: [{ text: 'Karakter ontvangen, zal het inlezen.' }] },
      ];

      // Convert chat history to Gemini format
      for (const msg of chatHistory) {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }

      // Add attachments as inline data to the last user message
      if (attachments?.length && contents.length > 0) {
        const lastUserIdx = contents.length - 1;
        if (contents[lastUserIdx].role === 'user') {
          for (const attachment of attachments) {
            contents[lastUserIdx].parts.push({
              inlineData: {
                mimeType: attachment.mimeType,
                data: attachment.data,
              },
            });
          }
        }
      }

      try {
        const response = await ai.models.generateContent({
          model: config.model,
          contents,
          config: {
            systemInstruction: CHARACTER_RESPONDER_PROMPT,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'object' as const,
              properties: {
                text: { type: 'string' as const },
                shouldUpdateCharacter: { type: 'boolean' as const },
              },
              required: ['text', 'shouldUpdateCharacter'],
            },
            maxOutputTokens: config.maxOutputTokens,
            temperature: config.temperature,
            topP: config.topP,
            topK: config.topK,
          },
        });

        const responseText = response.text?.trim() ?? null;

        if (!responseText) {
          logger.error('AI model returned empty response');
          throw new HttpsError('internal', 'No response from AI model');
        }

        const parsed = JSON.parse(responseText);
        const text: string = parsed.text;
        const shouldUpdateCharacter: boolean = parsed.shouldUpdateCharacter === true;

        if (!text) {
          logger.error('AI model returned empty text field');
          throw new HttpsError('internal', 'No response from AI model');
        }

        return { text, shouldUpdateCharacter };
      } catch (error) {
        if (error instanceof Error && error.message?.includes('429')) {
          throw new HttpsError('resource-exhausted', 'Rate limit exceeded. Please wait a moment before trying again.');
        }
        throw error;
      }
    }
  )
);
