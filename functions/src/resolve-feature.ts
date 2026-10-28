import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { wrapCallable } from './utils/sentry-error-handler';
import { SHARED_CORS } from './config/cors';
import { ensureAuthForTesting } from './utils/emulator-helpers';
import { requireAuthUid } from './utils/access';
import { resolveCharacterEntry } from './character/resolve-character-entry';

interface ResolveFeatureRequest {
  characterId: string;
  featureName: string;
  featureSource?: string;
  characterClass?: string;
  characterRace?: string;
}

interface ResolveFeatureResponse {
  description: string;
}

export const resolveFeature = onCall(
  {
    cors: SHARED_CORS,
    secrets: ['GOOGLE_AI_API_KEY'],
  },
  wrapCallable<ResolveFeatureRequest, ResolveFeatureResponse>(
    'resolveFeature',
    async (request): Promise<ResolveFeatureResponse> => {
      ensureAuthForTesting(request);
      const uid = requireAuthUid(request);

      const { characterId, featureName, featureSource, characterClass, characterRace } = request.data;

      if (!characterId || !featureName || typeof featureName !== 'string') {
        throw new HttpsError('invalid-argument', 'Missing required fields: characterId, featureName');
      }

      const contextParts: string[] = [];
      if (featureSource) contextParts.push(`source: ${featureSource}`);
      if (characterClass) contextParts.push(`class: ${characterClass}`);
      if (characterRace) contextParts.push(`race: ${characterRace}`);
      const contextText = contextParts.length > 0 ? ` (${contextParts.join(', ')})` : '';

      return resolveCharacterEntry<ResolveFeatureResponse>({
        label: 'resolveFeature',
        uid,
        characterId,
        featureKey: 'featureResolution',
        listPath: 'featuresAndTraits',
        matchName: featureName,
        fields: ['description'],
        prompt: `Return a JSON object (no markdown) for the D&D 5e feature/trait "${featureName}"${contextText}.
Fields:
- "description": full feature text from the rules, including any mechanical effects and level-based improvements

Return only valid JSON like: {"description": "..."}`,
      });
    }
  )
);
