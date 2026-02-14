import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { RateLimitError, Anthropic } from '@anthropic-ai/sdk';
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
  character?: Record<string, unknown>;
}

export const characterChat = onCall(
  {
    cors: SHARED_CORS,
    secrets: ['CLAUDE_API_KEY'],
  },
  wrapCallable<CharacterChatRequest, CharacterChatResponse>(
    'characterChat',
    async (request): Promise<CharacterChatResponse> => {
      const { systemPrompt, chatHistory } = request.data;

      if (!systemPrompt || !Array.isArray(chatHistory) || chatHistory.length === 0) {
        throw new HttpsError('invalid-argument', 'Missing required fields: systemPrompt, chatHistory');
      }

      const client = new Anthropic({
        apiKey: process.env.CLAUDE_API_KEY,
      });

      try {
          const response = await client.messages.create({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 1024,
              system: systemPrompt,
              messages: chatHistory,
              tools: [{
                  name: "submit_response",
                  description: "Gebruik deze tool om je interne gedachten en je uiteindelijke antwoord naar de gebruiker te sturen.",
                  input_schema: {
                      type: "object",
                      properties: {
                          message: {
                              type: "string",
                              description: "Het daadwerkelijke bericht naar de gebruiker."
                          },
                          character: {
                              type: "object",
                              description: "Het volledige bijgewerkte karakter als JSON object. Alleen meesturen als het karakter is gewijzigd. Weglaten als de gebruiker alleen een vraag stelt zonder wijzigingen. Nooit description of usage van spells meesturen.",
                              additionalProperties: true
                          }
                      },
                      required: ["message"]
                  }
              }],
              tool_choice: { type: "tool", name: "submit_response" }
          });

          const toolBlock = response.content.find(block => block.type === 'tool_use');

          if (!toolBlock || !toolBlock.input) {
              throw new HttpsError('internal', 'AI model failed to use the required tool');
          }

          return {
              //@ts-ignore
              text: toolBlock.input?.message,
              //@ts-ignore
              character: toolBlock.input?.character ?? undefined,
          };
      } catch (error) {
        if (error instanceof RateLimitError) {
          throw new HttpsError('resource-exhausted', 'Rate limit exceeded. Please wait a moment before trying again.');
        }
        throw error;
      }
    }
  )
);
