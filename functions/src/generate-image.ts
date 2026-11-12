import { HttpsError } from 'firebase-functions/v2/https';
import { getAiImageConfig, getAiFeatureConfig } from './utils/ai-settings';
import { generateText, getGeminiClient } from './utils/gemini-client';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';
import { ChatHistoryMessage } from './types/chat.types';
import { buildDownloadUrl } from './utils/storage-url';
import {
  IMAGE_GENERATION_SYSTEM_PROMPT,
  IMAGE_REFERENCE_STYLE_INSTRUCTION,
} from './prompts/image-generation.prompt';
import * as logger from './utils/logger';

export interface GenerateImageResponse {
  imageUrl: string;
  mimeType: string;
}

/** Default Gemini image model (Nano Banana 2.1). */
export const DEFAULT_IMAGE_MODEL = 'gemini-nano-banana-2.1';

/**
 * The image model from the AI settings. A value that isn't a Gemini model (e.g. a stale
 * `fal-ai/...` left in the settings) is replaced by the default.
 */
export function resolveImageModel(configuredModel: string): string {
  return configuredModel?.startsWith('gemini-') ? configuredModel : DEFAULT_IMAGE_MODEL;
}

/** Storage folder of a character's images; reference images must come from here. */
export function characterImagePrefix(characterId: string): string {
  return `images/${characterId}/`;
}

export interface CharacterImageRequest {
  characterId: string;
  /** Character context and conversation the image prompt is written from. */
  chatHistory: ChatHistoryMessage[];
  /** Previous portrait used as style reference; must be one of this character's images. */
  referenceImageStoragePath?: string | null;
}

/**
 * Write an image prompt from the conversation, render the portrait and store it
 * with the character (Storage + `characters/{id}/images`). Run by the chat worker,
 * for a turn whose sender was checked to own the character.
 */
export async function generateCharacterImage(request: CharacterImageRequest): Promise<GenerateImageResponse> {
  const { characterId, chatHistory, referenceImageStoragePath } = request;
  const db = getFirestore();

  const model = resolveImageModel((await getAiImageConfig()).model);

  // Use Gemini to convert character context + conversation into a descriptive image prompt
  const rawContext = chatHistory.map(chat => `[${chat.role}]: ${chat.content}`).join('\n');
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

/** Storage path of the character's newest portrait, used as style reference for the next one. */
export async function latestCharacterImagePath(characterId: string): Promise<string | null> {
  const snapshot = await getFirestore()
    .collection('characters').doc(characterId)
    .collection('images')
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  const storagePath = snapshot.empty ? undefined : snapshot.docs[0].data().storagePath;
  return typeof storagePath === 'string' && storagePath.startsWith(characterImagePrefix(characterId))
    ? storagePath
    : null;
}

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
