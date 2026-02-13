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
  thought: string;
  character?: unknown;
}

interface SubmitResponseInput {
  thought: string;
  message: string;
  character?: string;
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

      try {
        const response = await client.path('/chat/completions').post({
          body: {
            model: 'claude-haiku-4-5',
            max_tokens: 4096,
            messages: [
              { role: 'system', content: systemPrompt },
              ...chatHistory,
            ],
            tools: [{
              type: 'function',
              function: {
                name: 'submit_response',
                description: 'Gebruik deze tool om je interne gedachten en je uiteindelijke antwoord naar de gebruiker te sturen.',
                parameters: {
                  type: 'object',
                  properties: {
                    thought: {
                      type: 'string',
                      description: 'Je interne monoloog of redenering.',
                    },
                    message: {
                      type: 'string',
                      description: 'Het daadwerkelijke bericht naar de gebruiker.',
                    },
                    character: {
                      type: 'string',
                      description: 'De JSON data van het karakter volgens het schema in de system prompt.',
                    },
                  },
                  required: ['thought', 'message'],
                },
              },
            }],
            tool_choice: { type: 'function', function: { name: 'submit_response' } },
          },
        });

        if (isUnexpected(response)) {
          throw new HttpsError('internal', `Azure AI Foundry error: ${response.body.error.message}`);
        }

        const toolCall = response.body.choices[0]?.message?.tool_calls?.[0];

        if (!toolCall) {
          throw new HttpsError('internal', 'AI model failed to use the required tool');
        }

        const input = JSON.parse(toolCall.function.arguments) as SubmitResponseInput;

        return {
          thought: input.thought,
          text: input.message,
          character: input.character,
        };
      } catch (error) {
        if (error instanceof HttpsError) {
          throw error;
        }
        throw error;
      }
    }
  )
);
