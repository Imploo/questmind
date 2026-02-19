import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { wrapCallable } from './utils/sentry-error-handler';
import { getAiImageConfig } from './utils/ai-settings';
import { SHARED_CORS } from './index';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';
import { fal } from '@fal-ai/client';

export interface ChatHistoryMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface CharacterChatRequest {
    systemPrompt: string;
    chatHistory: ChatHistoryMessage[];
}

interface GenerateImageRequest {
    chatRequest: CharacterChatRequest;
    model: string;
    characterId?: string;
}

export interface GenerateImageResponse {
  imageUrl: string;
  mimeType: string;
}

export const generateImage = onCall(
  {
    cors: SHARED_CORS,
    secrets: ['FAL_API_KEY'],
  },
  wrapCallable<GenerateImageRequest, GenerateImageResponse>(
    'generateImage',
    async (request): Promise<GenerateImageResponse> => {
      const { chatRequest, model: requestModel, characterId } = request.data;

      if (!chatRequest || !characterId) {
        throw new HttpsError('invalid-argument', 'Missing required fields: chatRequest, characterId');
      }

      const imageConfig = await getAiImageConfig();
      const model = requestModel || imageConfig.model;

      const apiKey = process.env.FAL_API_KEY;
      if (!apiKey) {
        throw new HttpsError('failed-precondition', 'FAL API key not configured');
      }

      const prompt = chatRequest.systemPrompt + '\n' + chatRequest.chatHistory.map(chat => `[${chat.role}]: ${chat.content}\n`).join('');

      fal.config({ credentials: apiKey });

      const result = await fal.subscribe(model, {
        input: {
          prompt,
          image_size: 'landscape_4_3',
        },
      });

      const data = result.data as { images?: { url: string; content_type: string }[] } | undefined;
      const generatedImages = data?.images;
      if (!generatedImages || generatedImages.length === 0) {
        throw new HttpsError('internal', 'No image returned from image generation model');
      }

      const firstImage = generatedImages[0];
      const imageUrl = firstImage.url;
      const mimeType = firstImage.content_type || 'image/jpeg';

      // Download image from fal.ai URL
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new HttpsError('internal', `Failed to download generated image: ${response.statusText}`);
      }

      const imageBuffer = Buffer.from(await response.arrayBuffer());

      // Determine file extension from mime type
      const extension = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
      const filename = `${randomUUID()}.${extension}`;

      // Save to Cloud Storage under images/{characterId}/{filename}
      const storagePath = characterId
        ? `images/${characterId}/${filename}`
        : `images/uncategorized/${filename}`;

      const storage = getStorage().bucket();
      const file = storage.file(storagePath);

      await file.save(imageBuffer, {
        metadata: { contentType: mimeType },
      });

      // Save image metadata to Firestore (frontend constructs display URL from storagePath)
      if (characterId && request.auth) {
        const db = getFirestore();
        const imageRef = db
          .collection('characters')
          .doc(characterId)
          .collection('images')
          .doc();

        await imageRef.set({
          id: imageRef.id,
          characterId,
          mimeType,
          storagePath,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      // Return download URL for immediate display in chat
      const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${storage.name}/o/${encodeURIComponent(storagePath)}?alt=media`;

      return {
        imageUrl: downloadUrl,
        mimeType,
      };
    }
  )
);
