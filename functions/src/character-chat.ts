import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { GoogleGenAI, type ContentListUnion, type GenerateContentConfig } from '@google/genai';
import { wrapCallable } from './utils/sentry-error-handler';
import { SHARED_CORS } from './index';

export interface CharacterChatRequest {
  contents: ContentListUnion;
  config: GenerateContentConfig;
  model: string;
}

export interface MessageImage {
  mimeType: string;
  data: string; // base64 encoded
}

export interface CharacterChatResponse {
  text: string;
  images?: MessageImage[];
}

export const characterChat = onCall(
  {
    timeoutSeconds: 300,
    memory: '512MiB',
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

      if (!result.text && !result.candidates?.[0]?.content?.parts?.length) {
        throw new HttpsError('internal', 'No response from AI model');
      }

      // Extract text and images from response
      const text = result.text || '';
      const images: MessageImage[] = [];

      // Check if the response contains inline images
      if (result.candidates?.[0]?.content?.parts) {
        for (const part of result.candidates[0].content.parts) {
          if ('inlineData' in part && part.inlineData) {
            images.push({
              mimeType: part.inlineData.mimeType,
              data: part.inlineData.data,
            });
          }
        }
      }

      return { 
        text,
        ...(images.length > 0 && { images })
      };
    }
  )
);
