import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { wrapCallable } from './utils/sentry-error-handler';
import { SHARED_CORS } from './index';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';
import { fal } from '@fal-ai/client';

export interface CharacterVisuals {
  name: string;
  race: string;
  characterClass: string;
  appearance?: {
    age?: string;
    height?: string;
    weight?: string;
    eyes?: string;
    skin?: string;
    hair?: string;
    description?: string;
  };
}

export interface GenerateImageRequest {
  prompt: string;
  model: string;
  characterId?: string;
  characterVisuals?: CharacterVisuals;
}

export interface GenerateImageResponse {
  imageUrl: string;
  mimeType: string;
  imageId?: string;
}

function buildImagePrompt(userPrompt: string, visuals?: CharacterVisuals): string {
  if (!visuals) {
    return userPrompt;
  }

  const parts: string[] = [];

  // Character identity
  parts.push(`${visuals.name}, a ${visuals.race} ${visuals.characterClass}`);

  // Physical appearance details
  const app = visuals.appearance;
  if (app) {
    if (app.description) {
      parts.push(app.description);
    }
    const details: string[] = [];
    if (app.hair) details.push(`${app.hair} hair`);
    if (app.eyes) details.push(`${app.eyes} eyes`);
    if (app.skin) details.push(`${app.skin} skin`);
    if (app.height) details.push(`height: ${app.height}`);
    if (app.age) details.push(`age: ${app.age}`);
    if (details.length > 0) {
      parts.push(details.join(', '));
    }
  }

  // User scene/action request
  parts.push(userPrompt);

  return parts.join('. ');
}

export const generateImage = onCall(
  {
    cors: SHARED_CORS,
    secrets: ['FAL_API_KEY'],
  },
  wrapCallable<GenerateImageRequest, GenerateImageResponse>(
    'generateImage',
    async (request): Promise<GenerateImageResponse> => {
      const { prompt, model, characterId, characterVisuals } = request.data;

      if (!prompt || !model) {
        throw new HttpsError('invalid-argument', 'Missing required fields: prompt, model');
      }

      const apiKey = process.env.FAL_API_KEY;
      if (!apiKey) {
        throw new HttpsError('failed-precondition', 'FAL API key not configured');
      }

      fal.config({ credentials: apiKey });

      const enrichedPrompt = buildImagePrompt(prompt, characterVisuals);

      const result = await fal.subscribe(model, {
        input: {
          prompt: enrichedPrompt,
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
        metadata: {
          contentType: mimeType,
        },
        public: false,
      });

      // Generate signed URL valid for 7 days
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });

      // Save image metadata to Firestore if characterId is provided
      let imageId: string | undefined;
      if (characterId && request.auth) {
        const userId = request.auth.uid;
        const db = getFirestore();
        const imageRef = db
          .collection('users')
          .doc(userId)
          .collection('characters')
          .doc(characterId)
          .collection('images')
          .doc();

        imageId = imageRef.id;

        await imageRef.set({
          id: imageId,
          characterId,
          url: signedUrl,
          mimeType,
          storagePath,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      return {
        imageUrl: signedUrl,
        mimeType,
        imageId,
      };
    }
  )
);
