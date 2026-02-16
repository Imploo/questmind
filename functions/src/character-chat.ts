import { HttpsError, onCall } from 'firebase-functions/v2/https';
import ModelClient, { isUnexpected } from '@azure-rest/ai-inference';
import { AzureKeyCredential } from '@azure/core-auth';
import { wrapCallable } from './utils/sentry-error-handler';
import { SHARED_CORS } from './index';

interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CharacterChatRequest {
  systemPrompt: string;
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
      const { systemPrompt, chatHistory } = request.data;

      if (!systemPrompt || !Array.isArray(chatHistory) || chatHistory.length === 0) {
        throw new HttpsError('invalid-argument', 'Missing required fields: systemPrompt, chatHistory');
      }

      const endpoint = process.env.AZURE_FOUNDRY_ENDPOINT!;
      const apiKey = process.env.AZURE_FOUNDRY_API_KEY!;

      const client = ModelClient(endpoint, new AzureKeyCredential(apiKey));

      const response = await client.path('/chat/completions').post({
        body: {
          model: 'claude-haiku-4-5',
          max_tokens: 4096,
          messages: [
            { role: 'system', content: systemPrompt },
            ...chatHistory,
          ],
        },
      });

      if (isUnexpected(response)) {
        throw new HttpsError('internal', `Azure AI Foundry error: ${response.body.error.message}`);
      }

      const text = response.body.choices[0]?.message?.content;

      if (!text) {
        throw new HttpsError('internal', 'No response from AI model');
      }

      return { text };
    }
  )
);
