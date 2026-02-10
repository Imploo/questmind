import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { GoogleGenAI, type ContentListUnion, type GenerateContentConfig } from '@google/genai';
import { wrapCallable } from './utils/sentry-error-handler';
import { SHARED_CORS } from './index';
import { getStorage } from 'firebase-admin/storage';
import { randomUUID } from 'crypto';

export interface CharacterChatRequest {
  contents: ContentListUnion;
  config: GenerateContentConfig;
  model: string;
  characterId?: string;
}

export interface MessageImage {
  url: string;
  mimeType: string;
}

export interface CharacterChatResponse {
  text: string;
  images?: MessageImage[];
}

export const characterChat = onCall(
  {
      region: 'us-central1',
    timeoutSeconds: 300,
    memory: '512MiB',
    cors: SHARED_CORS,
    secrets: ['GOOGLE_AI_API_KEY'],
  },
  wrapCallable<CharacterChatRequest, CharacterChatResponse>(
    'characterChat',
    async (request): Promise<CharacterChatResponse> => {
      const { contents, config, model, characterId } = request.data;

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
        const storage = getStorage().bucket();
        
        for (const part of result.candidates[0].content.parts) {
          if ('inlineData' in part && part.inlineData && 
              part.inlineData.mimeType && part.inlineData.data) {
            
            // Decode base64 image data
            const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
            
            // Determine file extension from mime type
            const extension = part.inlineData.mimeType.split('/')[1] || 'png';
            const filename = `${randomUUID()}.${extension}`;
            
            // Create storage path
            const storagePath = characterId
              ? `chat/${characterId}/${filename}`
              : `chat-images/${filename}`;
            
            const file = storage.file(storagePath);
            
            // Upload to Cloud Storage
            await file.save(imageBuffer, {
              metadata: {
                contentType: part.inlineData.mimeType,
              },
              public: false,
            });
            
            // Generate signed URL (valid for 7 days)
            const [signedUrl] = await file.getSignedUrl({
              action: 'read',
              expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
            });
            
            images.push({
              url: signedUrl,
              mimeType: part.inlineData.mimeType,
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
