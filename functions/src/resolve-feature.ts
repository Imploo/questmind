import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { wrapCallable } from './utils/sentry-error-handler';
import { SHARED_CORS } from './config/cors';
import { ensureAuthForTesting } from './utils/emulator-helpers';
import { requireAuthUid } from './utils/access';
import { resolveCharacterEntry } from './character/resolve-character-entry';
import {
  describeCharacter,
  readResolutionCharacter,
  ResolutionCharacter,
  ResolutionCharacterFields,
} from './character/resolution-context';

interface ResolveFeatureRequest extends ResolutionCharacterFields {
  characterId: string;
  featureName: string;
  featureSource?: string;
}

interface ResolveFeatureResponse {
  description: string;
}

/** The prompt for one feature, written for the character that has it. */
export function buildFeaturePrompt(featureName: string, featureSource: string | undefined, character: ResolutionCharacter): string {
  const who = describeCharacter(character);
  const sourceText = featureSource ? ` (source: ${featureSource})` : '';
  const rules = [
    character.class || character.race
      ? `Give the version of the feature that this character has through its own class, subclass or race. Several classes share feature names (Spellcasting, Extra Attack, Channel Divinity, Unarmored Defense); never describe another class's version.`
      : null,
    character.level
      ? `Describe the feature as it works at level ${character.level}. Where the rules scale with level or refer to a class table, state the value for level ${character.level}.`
      : null,
    character.level
      ? `Leave out everything the character only gets at a higher level: no "at 11th level this becomes ...", no table rows above level ${character.level}.`
      : `Leave out improvements that only come at higher levels.`,
  ].filter(Boolean);

  return `Return a JSON object (no markdown) for the D&D 5e feature/trait "${featureName}"${sourceText}${who ? `, as it applies to ${who}` : ''}.
Fields:
- "description": the feature text from the rules, including its mechanical effects

Rules for the description:
${rules.map(rule => `- ${rule}`).join('\n')}

Return only valid JSON like: {"description": "..."}`;
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

      const { characterId, featureName, featureSource } = request.data;

      if (!characterId || !featureName || typeof featureName !== 'string') {
        throw new HttpsError('invalid-argument', 'Missing required fields: characterId, featureName');
      }

      return resolveCharacterEntry<ResolveFeatureResponse>({
        label: 'resolveFeature',
        uid,
        characterId,
        featureKey: 'featureResolution',
        listPath: 'featuresAndTraits',
        matchName: featureName,
        fields: ['description'],
        prompt: buildFeaturePrompt(featureName, featureSource, readResolutionCharacter(request.data)),
      });
    }
  )
);
