import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { wrapCallable } from './utils/sentry-error-handler';
import { SHARED_CORS } from './config/cors';
import { ensureAuthForTesting } from './utils/emulator-helpers';
import { requireAuthUid } from './utils/access';
import { resolveCharacterEntry } from './character/resolve-character-entry';
import {
  describeCharacter,
  levelInRange,
  readResolutionCharacter,
  rulesInstruction,
  ResolutionCharacter,
  ResolutionCharacterFields,
} from './character/resolution-context';

interface ResolveSpellRequest extends ResolutionCharacterFields {
  characterId: string;
  spellName: string;
  spellLevel?: number;
  spellSchool?: string;
  /** Highest spell slot level the character has. */
  maxSpellSlotLevel?: number;
}

interface ResolveSpellResponse {
  description: string;
  usage: string;
}

interface SpellToDescribe {
  name: string;
  level?: number;
  school?: string;
}

/**
 * What to say about a spell growing stronger. A cantrip grows with the character's
 * level; any other spell with the slot it is cast with, which takes a slot above
 * the spell's own level.
 */
function scalingRule(spell: SpellToDescribe, character: ResolutionCharacter, maxSlot: number | null): string {
  if (spell.level === 0) {
    return character.level
      ? `If the cantrip grows with character level, give its damage or effect at level ${character.level} and leave out the higher tiers.`
      : `If the cantrip grows with character level, say so.`;
  }
  // The 2024 rules renamed the section.
  const section = character.rules === '2024' ? '"Using a Higher-Level Spell Slot."' : '"At Higher Levels."';
  if (maxSlot === null) {
    return `Include the ${section} section if the spell has one.`;
  }
  if (spell.level === undefined) {
    return `Include the ${section} section only if the spell's level is below ${maxSlot}, the character's highest spell slot.`;
  }
  return maxSlot > spell.level
    ? `Include the ${section} section if the spell has one; the character's highest spell slot is level ${maxSlot}.`
    : `Leave out the ${section} section: the character has no spell slot above the spell's level.`;
}

/** The prompt for one spell, written for the character that casts it. */
export function buildSpellPrompt(spell: SpellToDescribe, character: ResolutionCharacter, maxSlot: number | null): string {
  const levelText = spell.level === 0 ? 'cantrip' : spell.level !== undefined ? `level ${spell.level} spell` : 'spell';
  const schoolText = spell.school ? ` (${spell.school})` : '';
  const who = describeCharacter(character);

  return `Return a JSON object (no markdown) for the D&D 5e spell "${spell.name}" (${levelText}${schoolText})${who ? `, as cast by ${who}` : ''}.
${rulesInstruction(character)}
Fields:
- "description": the spell text from the rules. ${scalingRule(spell, character, maxSlot)}
- "usage": multiline string formatted as "Casting Time: ...\\nRange: ...\\nComponents: ...\\nDuration: ..."

Return only valid JSON like: {"description": "...", "usage": "Casting Time: 1 action\\nRange: 60 feet\\nComponents: V, S\\nDuration: Instantaneous"}`;
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

      const { characterId, spellName, spellLevel, spellSchool, maxSpellSlotLevel } = request.data;

      if (!characterId || !spellName || typeof spellName !== 'string') {
        throw new HttpsError('invalid-argument', 'Missing required fields: characterId, spellName');
      }

      return resolveCharacterEntry<ResolveSpellResponse>({
        label: 'resolveSpell',
        uid,
        characterId,
        featureKey: 'spellResolution',
        listPath: 'spellcasting.spells',
        matchName: spellName,
        fields: ['description', 'usage'],
        prompt: buildSpellPrompt(
          { name: spellName, level: spellLevel, school: spellSchool },
          readResolutionCharacter(request.data),
          levelInRange(maxSpellSlotLevel, 1, 9)
        ),
      });
    }
  )
);
