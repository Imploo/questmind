import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { Part } from '@google/genai';
import { getFirestore } from 'firebase-admin/firestore';
import { wrapCallable } from './utils/sentry-error-handler';
import { getAiFeatureConfig } from './utils/ai-settings';
import { GeminiEmptyResponseError, GeminiJsonError, generateJson } from './utils/gemini-client';
import { SHARED_CORS } from './config/cors';
import { ensureAuthForTesting } from './utils/emulator-helpers';
import { assertCharacterOwner, requireAuthUid } from './utils/access';
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
      ensureAuthForTesting(request);
      const uid = requireAuthUid(request);

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

      await assertCharacterOwner(getFirestore(), characterId, uid);

      const config = await getAiFeatureConfig('characterChatText');

      // AI 1: Text responder — build Gemini contents with character context
      const contents: { role: string; parts: Part[] }[] = [
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
        logger.info('characterChat: calling Gemini', {
          model: config.model,
          hasAttachments: Boolean(attachments?.length),
          attachmentCount: attachments?.length ?? 0,
          contentParts: contents.length,
        });

        const parsed = await generateJson<{ text?: string; shouldUpdateCharacter?: boolean }>({
          config,
          label: 'characterChat',
          contents,
          systemInstruction: CHARACTER_RESPONDER_PROMPT,
          schema: {
            type: 'object' as const,
            properties: {
              text: { type: 'string' as const },
              shouldUpdateCharacter: { type: 'boolean' as const },
            },
            required: ['text', 'shouldUpdateCharacter'],
          },
        });

        const text = parsed?.text;
        if (!text) {
          throw new HttpsError('internal', 'No response from AI model');
        }

        return { text, shouldUpdateCharacter: parsed.shouldUpdateCharacter === true };
      } catch (error) {
        if (error instanceof HttpsError) {
          throw error;
        }
        if (error instanceof GeminiJsonError) {
          throw new HttpsError('internal', 'AI model returned invalid JSON. The response may have been truncated.');
        }
        if (error instanceof GeminiEmptyResponseError) {
          throw new HttpsError('internal', 'No response from AI model');
        }
        if (error instanceof Error && error.message?.includes('429')) {
          throw new HttpsError('resource-exhausted', 'Rate limit exceeded. Please wait a moment before trying again.');
        }
        // Reported once by wrapCallable.
        throw error;
      }
    }
  )
);
