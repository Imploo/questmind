import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { wrapCallable } from './utils/sentry-error-handler';
import { getAiImageConfig, getAiFeatureConfig } from './utils/ai-settings';
import { SHARED_CORS } from './index';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';
import { fal } from '@fal-ai/client';
import { GoogleGenAI } from '@google/genai';
import { ChatHistoryMessage } from './types/chat.types';
import * as logger from './utils/logger';

export interface CharacterChatRequest {
    systemPrompt: string;
    chatHistory: ChatHistoryMessage[];
}

interface GenerateImageRequest {
    chatRequest: CharacterChatRequest;
    model: string;
    characterId?: string;
    referenceImageStoragePath?: string;
}

export interface GenerateImageResponse {
  imageUrl: string;
  mimeType: string;
}

export const generateImage = onCall(
  {
    cors: SHARED_CORS,
    secrets: ['FAL_API_KEY', 'GOOGLE_AI_API_KEY'],
  },
  wrapCallable<GenerateImageRequest, GenerateImageResponse>(
    'generateImage',
    async (request): Promise<GenerateImageResponse> => {
      if (!request.auth?.uid) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      const { chatRequest, model: requestModel, characterId, referenceImageStoragePath } = request.data;

      if (!chatRequest || !characterId) {
        throw new HttpsError('invalid-argument', 'Missing required fields: chatRequest, characterId');
      }

      const imageConfig = await getAiImageConfig();
      const model = requestModel || imageConfig.model;

      const falApiKey = process.env.FAL_API_KEY;
      if (!falApiKey) {
        throw new HttpsError('failed-precondition', 'FAL API key not configured');
      }

      const googleApiKey = process.env.GOOGLE_AI_API_KEY;
      if (!googleApiKey) {
        throw new HttpsError('failed-precondition', 'Google AI API key not configured');
      }

      // Use Gemini to convert character context + conversation into a descriptive image prompt
      const rawContext = chatRequest.chatHistory.map(chat => `[${chat.role}]: ${chat.content}`).join('\n');
      const promptConfig = await getAiFeatureConfig('imagePromptGeneration');

      // Build multimodal content: text context + optional reference image
      const contentParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
        { text: rawContext },
      ];

      let referenceStyleInstruction = '';

      if (referenceImageStoragePath) {
        try {
          const storage = getStorage().bucket();
          const [imageBuffer] = await storage.file(referenceImageStoragePath).download();
          const extension = referenceImageStoragePath.split('.').pop()?.toLowerCase() || 'jpg';
          const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';
          contentParts.push({
            inlineData: { mimeType, data: imageBuffer.toString('base64') },
          });
          referenceStyleInstruction =
            '\n\nA reference image of a previous portrait of this character is included. '
            + 'Analyze its visual style (lighting, color palette, art style, composition) and incorporate similar style elements into your prompt. '
            + 'However, follow the user\'s instructions for the new scene, pose, or expression. '
            + 'Do NOT describe the reference image literally — use it only for style inspiration.';
        } catch (err) {
          logger.warn('Failed to load reference image, proceeding without it:', err);
        }
      }

      const ai = new GoogleGenAI({ apiKey: googleApiKey });
      const geminiResult = await ai.models.generateContent({
        model: promptConfig.model,
        contents: contentParts,
        config: {
          systemInstruction: chatRequest.systemPrompt
            + '\n\nGenerate a single, detailed image prompt in English (max 1000 words) describing the character portrait. '
            + 'Focus on physical appearance, clothing, equipment, expression, and setting. '
            + 'Do NOT include any instructions, metadata, or formatting — only the image description.'
            + referenceStyleInstruction,
          temperature: promptConfig.temperature,
          topP: promptConfig.topP,
          topK: promptConfig.topK,
          maxOutputTokens: promptConfig.maxOutputTokens,
        },
      });

      const prompt = geminiResult.text?.trim();
      if (!prompt) {
        throw new HttpsError('internal', 'Failed to generate image description from character context');
      }

      fal.config({ credentials: falApiKey });

      const result = await fal.subscribe(model, {
        input: {
          prompt: `Photorealistic image. ${prompt}`,
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
