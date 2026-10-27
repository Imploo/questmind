import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { wrapCallable } from './utils/sentry-error-handler';
import { SHARED_CORS } from './config/cors';
import { ensureAuthForTesting } from './utils/emulator-helpers';
import { requireAuthUid } from './utils/access';
import { resolveCharacterEntry } from './character/resolve-character-entry';

interface ResolveSpellRequest {
  characterId: string;
  spellName: string;
  spellLevel?: number;
  spellSchool?: string;
}

interface ResolveSpellResponse {
  description: string;
  usage: string;
}

export const resolveSpell = onCall(
  {
    cors: SHARED_CORS,
    secrets: ['GOOGLE_AI_API_KEY'],
  },
  wrapCallable<ResolveSpellRequest, ResolveSpellResponse>(
    'resolveSpell',
    async (request): Promise<ResolveSpellResponse> => {
      ensureAuthForTesting(request);
      const uid = requireAuthUid(request);

      const { characterId, spellName, spellLevel, spellSchool } = request.data;

      if (!characterId || !spellName || typeof spellName !== 'string') {
        throw new HttpsError('invalid-argument', 'Missing required fields: characterId, spellName');
      }

      const levelText = spellLevel === 0 ? 'cantrip' : spellLevel !== undefined ? `level ${spellLevel} spell` : 'spell';
      const schoolText = spellSchool ? ` (${spellSchool})` : '';

      return resolveCharacterEntry<ResolveSpellResponse>({
        label: 'resolveSpell',
        uid,
        characterId,
        featureKey: 'spellResolution',
        listPath: 'spellcasting.spells',
        matchName: spellName,
        fields: ['description', 'usage'],
        prompt: `Return a JSON object (no markdown) for the D&D 5e spell "${spellName}" (${levelText}${schoolText}).
Fields:
- "description": full spell text from the rules, include "At Higher Levels." section if applicable
- "usage": multiline string formatted as "Casting Time: ...\\nRange: ...\\nComponents: ...\\nDuration: ..."

Return only valid JSON like: {"description": "...", "usage": "Casting Time: 1 action\\nRange: 60 feet\\nComponents: V, S\\nDuration: Instantaneous"}`,
      });
    }
  )
);
