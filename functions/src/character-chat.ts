import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import { wrapCallable } from './utils/sentry-error-handler';
import { SHARED_CORS } from './index';

interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CharacterChatRequest {
  systemPrompt: string;
  message: string;
  chatHistory?: ChatHistoryMessage[];
}

export interface CharacterChatResponse {
  text: string;
}

export const characterChat = onCall(
  {
    cors: SHARED_CORS,
  },
  wrapCallable<CharacterChatRequest, CharacterChatResponse>(
    'characterChat',
    async (request): Promise<CharacterChatResponse> => {
      const { systemPrompt, chatHistory = [] } = request.data;

      if (!systemPrompt || !chatHistory) {
        throw new HttpsError('invalid-argument', 'Missing required fields: systemPrompt, chatHistory');
      }

      const client = new AnthropicVertex({
        projectId: process.env.GCLOUD_PROJECT,
        region: 'europe-west1',
      });

      const response = await client.messages.create({
        model: 'claude-haiku-4-5@20251001',
        max_tokens: 8192,
        system: systemPrompt,
        messages: chatHistory,
      });

      const textContent = response.content.find(block => block.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new HttpsError('internal', 'No response from AI model');
      }

      return { text: textContent.text };
    }
  )
);
