import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { wrapCallable } from './utils/sentry-error-handler';
import { getAiImageConfig, getAiFeatureConfig } from './utils/ai-settings';
import { generateText, getGeminiClient } from './utils/gemini-client';
import { SHARED_CORS } from './config/cors';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';
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
    /** Requested Gemini image model; only honoured when it is on the allow-list. */
    model?: string;
    characterId: string;
    /** Previous portrait used as style reference; must be one of this character's images. */
    referenceImageStoragePath?: string;
}

export interface GenerateImageResponse {
  imageUrl: string;
  mimeType: string;
}

/** Default Gemini image model (Nano Banana 2.1). */
export const DEFAULT_IMAGE_MODEL = 'gemini-nano-banana-2.1';

/** Gemini image models a client may ask for; anything else falls back to the AI settings model. */
export const ALLOWED_IMAGE_MODELS: ReadonlySet<string> = new Set([
  'gemini-nano-banana-2.1',
  'gemini-3.1-flash-image',
  'gemini-3.1-flash-lite-image',
  'gemini-3-pro-image',
]);

/**
 * The requested model when allowed (or the configured one), otherwise the configured model.
 * A configured model that isn't a Gemini model (e.g. a stale `fal-ai/...` value in the AI
 * settings) is replaced by the default.
 */
export function resolveImageModel(requested: unknown, configuredModel: string): string {
  const configured = configuredModel?.startsWith('gemini-') ? configuredModel : DEFAULT_IMAGE_MODEL;
  if (typeof requested === 'string' && (requested === configured || ALLOWED_IMAGE_MODELS.has(requested))) {
    return requested;
  }
  return configured;
}

/** Storage folder of a character's images; reference images must come from here. */
export function characterImagePrefix(characterId: string): string {
  return `images/${characterId}/`;
}

export const generateImage = onCall(
  {
    cors: SHARED_CORS,
    secrets: ['GOOGLE_AI_API_KEY'],
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

      const { imageBuffer, mimeType } = await generatePortrait(model, `Photorealistic image. ${prompt}`);

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

/** Render the portrait with a Gemini image model (Interactions API, image output). */
async function generatePortrait(model: string, prompt: string): Promise<{ imageBuffer: Buffer; mimeType: string }> {
  let interaction;
  try {
    interaction = await getGeminiClient().interactions.create({
      model,
      input: prompt,
      response_format: { type: 'image', aspect_ratio: '4:3' },
      store: false,
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    const status = (error as { status?: number })?.status;
    if (status === 429) {
      throw new HttpsError('resource-exhausted', 'Rate limit exceeded. Please wait a moment before trying again.');
    }
    throw error;
  }

  const image = interaction.output_image;
  if (!image?.data) {
    logger.warn('generateImage: Gemini returned no image', {
      model,
      status: interaction.status,
      text: interaction.output_text?.slice(0, 300),
    });
    throw new HttpsError('internal', 'No image returned from image generation model');
  }

  logger.info('generateImage: Gemini image received', { model, mimeType: image.mime_type });
  return { imageBuffer: Buffer.from(image.data, 'base64'), mimeType: image.mime_type || 'image/png' };
}
