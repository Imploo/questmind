import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { wrapCallable } from './utils/sentry-error-handler';
import { getAiImageConfig, getAiFeatureConfig } from './utils/ai-settings';
import { generateText } from './utils/gemini-client';
import { SHARED_CORS } from './config/cors';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';
import { fal } from '@fal-ai/client';
import { ChatHistoryMessage } from './types/chat.types';
import { ensureAuthForTesting } from './utils/emulator-helpers';
import { assertCharacterOwner, assertValidId, requireAuthUid } from './utils/access';
import { buildDownloadUrl } from './utils/storage-url';
import {
  IMAGE_GENERATION_SYSTEM_PROMPT,
  IMAGE_REFERENCE_STYLE_INSTRUCTION,
} from './prompts/image-generation.prompt';
import * as logger from './utils/logger';

/**
 * Conversation context the image prompt is written from. `systemPrompt` is
 * still accepted for backward compatibility but ignored: the system prompt is
 * decided server-side.
 */
export interface ImagePromptContext {
    systemPrompt?: string;
    chatHistory: ChatHistoryMessage[];
}

interface GenerateImageRequest {
    chatRequest: ImagePromptContext;
    /** Requested fal model; only honoured when it is on the allow-list. */
    model?: string;
    characterId: string;
    /** Previous portrait used as style reference; must be one of this character's images. */
    referenceImageStoragePath?: string;
}

export interface GenerateImageResponse {
  imageUrl: string;
  mimeType: string;
}

/** fal.ai models a client may ask for; anything else falls back to the AI settings model. */
export const ALLOWED_IMAGE_MODELS: ReadonlySet<string> = new Set([
  'fal-ai/flux/schnell',
  'fal-ai/flux/dev',
  'fal-ai/flux-pro/v1.1',
  'fal-ai/flux-pro/v1.1-ultra',
]);

/** The requested model when allowed (or the configured one), otherwise the configured model. */
export function resolveImageModel(requested: unknown, configuredModel: string): string {
  if (typeof requested === 'string' && (requested === configuredModel || ALLOWED_IMAGE_MODELS.has(requested))) {
    return requested;
  }
  return configuredModel;
}

/** Storage folder of a character's images; reference images must come from here. */
export function characterImagePrefix(characterId: string): string {
  return `images/${characterId}/`;
}

export const generateImage = onCall(
  {
    cors: SHARED_CORS,
    secrets: ['FAL_API_KEY', 'GOOGLE_AI_API_KEY'],
  },
  wrapCallable<GenerateImageRequest, GenerateImageResponse>(
    'generateImage',
    async (request): Promise<GenerateImageResponse> => {
      ensureAuthForTesting(request);
      const uid = requireAuthUid(request);

      const { chatRequest, model: requestModel, referenceImageStoragePath } = request.data ?? {};
      if (!chatRequest || !Array.isArray(chatRequest.chatHistory)) {
        throw new HttpsError('invalid-argument', 'Missing required fields: chatRequest, characterId');
      }
      const characterId = assertValidId(request.data.characterId, 'characterId');

      if (referenceImageStoragePath !== undefined && referenceImageStoragePath !== null) {
        if (
          typeof referenceImageStoragePath !== 'string' ||
          !referenceImageStoragePath.startsWith(characterImagePrefix(characterId)) ||
          referenceImageStoragePath.includes('..')
        ) {
          throw new HttpsError('invalid-argument', 'referenceImageStoragePath does not belong to this character');
        }
      }

      const db = getFirestore();
      await assertCharacterOwner(db, characterId, uid);

      const imageConfig = await getAiImageConfig();
      const model = resolveImageModel(requestModel, imageConfig.model);

      const falApiKey = process.env.FAL_API_KEY;
      if (!falApiKey) {
        throw new HttpsError('failed-precondition', 'FAL API key not configured');
      }

      // Use Gemini to convert character context + conversation into a descriptive image prompt
      const rawContext = chatRequest.chatHistory.map(chat => `[${chat.role}]: ${chat.content}`).join('\n');
      const promptConfig = await getAiFeatureConfig('imagePromptGeneration');

      // Build multimodal content: text context + optional reference image
      const contentParts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [
        { text: rawContext },
      ];

      let referenceStyleInstruction = '';

      if (referenceImageStoragePath) {
        try {
          const [imageBuffer] = await getStorage().bucket().file(referenceImageStoragePath).download();
          const extension = referenceImageStoragePath.split('.').pop()?.toLowerCase() || 'jpg';
          const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';
          contentParts.push({
            inlineData: { mimeType, data: imageBuffer.toString('base64') },
          });
          referenceStyleInstruction = IMAGE_REFERENCE_STYLE_INSTRUCTION;
        } catch (err) {
          logger.warn('Failed to load reference image, proceeding without it:', err);
        }
      }

      let prompt: string;
      try {
        prompt = await generateText({
          config: promptConfig,
          label: 'generateImage',
          contents: contentParts,
          systemInstruction: IMAGE_GENERATION_SYSTEM_PROMPT + referenceStyleInstruction,
        });
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        logger.warn('generateImage: image prompt generation failed', error);
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
      const mimeType = firstImage.content_type || 'image/jpeg';

      // Download image from fal.ai URL
      const response = await fetch(firstImage.url);
      if (!response.ok) {
        throw new HttpsError('internal', `Failed to download generated image: ${response.statusText}`);
      }

      const imageBuffer = Buffer.from(await response.arrayBuffer());

      // Determine file extension from mime type
      const extension = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
      const storagePath = `${characterImagePrefix(characterId)}${randomUUID()}.${extension}`;

      const bucket = getStorage().bucket();
      await bucket.file(storagePath).save(imageBuffer, {
        metadata: { contentType: mimeType },
      });

      // Save image metadata to Firestore (frontend constructs display URL from storagePath)
      const imageRef = db.collection('characters').doc(characterId).collection('images').doc();
      await imageRef.set({
        id: imageRef.id,
        characterId,
        mimeType,
        storagePath,
        createdAt: FieldValue.serverTimestamp(),
      });

      // Return download URL for immediate display in chat (no token: Storage rules apply)
      return {
        imageUrl: buildDownloadUrl(bucket.name, storagePath),
        mimeType,
      };
    }
  )
);
