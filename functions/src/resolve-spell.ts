import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { Anthropic } from '@anthropic-ai/sdk';
import { getFirestore } from 'firebase-admin/firestore';
import { wrapCallable } from './utils/sentry-error-handler';
import { SHARED_CORS } from './index';

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
    secrets: ['CLAUDE_API_KEY'],
  },
  wrapCallable<ResolveSpellRequest, ResolveSpellResponse>(
    'resolveSpell',
    async (request): Promise<ResolveSpellResponse> => {
      const { characterId, spellName, spellLevel, spellSchool } = request.data;

      if (!characterId || !spellName) {
        throw new HttpsError('invalid-argument', 'Missing required fields: characterId, spellName');
      }

      const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

      const levelText = spellLevel === 0 ? 'cantrip' : spellLevel !== undefined ? `level ${spellLevel} spell` : 'spell';
      const schoolText = spellSchool ? ` (${spellSchool})` : '';

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: `Return a JSON object (no markdown) for the D&D 5e spell "${spellName}" (${levelText}${schoolText}).
Fields:
- "description": full spell text from the rules, include "At Higher Levels." section if applicable
- "usage": multiline string formatted as "Casting Time: ...\nRange: ...\nComponents: ...\nDuration: ..."

Return only valid JSON like: {"description": "...", "usage": "Casting Time: 1 action\nRange: 60 feet\nComponents: V, S\nDuration: Instantaneous"}`
        }],
      });

      const text = response.content[0]?.type === 'text' ? response.content[0].text : '';

      let details: ResolveSpellResponse;
      try {
        details = JSON.parse(text) as ResolveSpellResponse;
        if (!details.description || !details.usage) {
          throw new Error('Missing required fields in response');
        }
      } catch {
        throw new HttpsError('internal', 'Failed to parse spell details from AI response');
      }

      // Patch Firestore active version (best-effort — do not fail the request if this fails)
      try {
        const db = getFirestore();
        const charSnap = await db.collection('characters').doc(characterId).get();
        const activeVersionId = charSnap.data()?.['activeVersionId'] as string | undefined;

        if (activeVersionId) {
          const vRef = db.collection('characters').doc(characterId).collection('versions').doc(activeVersionId);
          const vSnap = await vRef.get();

          if (vSnap.exists) {
            const spells = (vSnap.data()?.['character']?.['spellcasting']?.['spells'] ?? []) as Array<string | Record<string, unknown>>;
            const updated = spells.map(s => {
              if (typeof s === 'string') return s;
              if ((s['name'] as string)?.toLowerCase() === spellName.toLowerCase()) {
                return { ...s, description: details.description, usage: details.usage };
              }
              return s;
            });
            await vRef.update({ 'character.spellcasting.spells': updated });
          }
        }
      } catch (e) {
        console.error('resolveSpell: Firestore patch failed (non-fatal):', e);
      }

      return details;
    }
  )
);
