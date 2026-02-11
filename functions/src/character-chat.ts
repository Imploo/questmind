import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { GoogleGenAI, type ContentListUnion, type GenerateContentConfig } from '@google/genai';
import { wrapCallable } from './utils/sentry-error-handler';
import { SHARED_CORS } from './index';

export interface CharacterChatRequest {
  contents: ContentListUnion;
  config: GenerateContentConfig;
  model: string;
}

export interface CharacterChatResponse {
  text: string;
}

export const characterChat = onCall(
  {
    cors: SHARED_CORS,
    secrets: ['GOOGLE_AI_API_KEY'],
  },
  wrapCallable<CharacterChatRequest, CharacterChatResponse>(
    'characterChat',
    async (request): Promise<CharacterChatResponse> => {
      const { contents, config, model } = request.data;

      if (!contents || !model) {
        throw new HttpsError('invalid-argument', 'Missing required fields: contents, model');
      }

      const apiKey = process.env.GOOGLE_AI_API_KEY;
      if (!apiKey) {
        throw new HttpsError('failed-precondition', 'AI API key not configured');
      }

      const ai = new GoogleGenAI({ apiKey });

      const result = await ai.models.generateContent({
        model,
        contents,
        config,
      });

      if (!result.text) {
        throw new HttpsError('internal', 'No response from AI model');
      }

      return { text: result.text };
    }
  )
);
