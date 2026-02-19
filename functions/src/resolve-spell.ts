import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { GoogleGenAI } from '@google/genai';
import { getFirestore } from 'firebase-admin/firestore';
import { wrapCallable } from './utils/sentry-error-handler';
import { getAiFeatureConfig } from './utils/ai-settings';
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
    secrets: ['GOOGLE_AI_API_KEY'],
  },
  wrapCallable<ResolveSpellRequest, ResolveSpellResponse>(
    'resolveSpell',
    async (request): Promise<ResolveSpellResponse> => {
      const { characterId, spellName, spellLevel, spellSchool } = request.data;

      if (!characterId || !spellName) {
        throw new HttpsError('invalid-argument', 'Missing required fields: characterId, spellName');
      }

      const apiKey = process.env.GOOGLE_AI_API_KEY;
      if (!apiKey) {
        throw new HttpsError('failed-precondition', 'AI API key not configured');
      }

      const ai = new GoogleGenAI({ apiKey });
      const config = await getAiFeatureConfig('spellResolution');

      const levelText = spellLevel === 0 ? 'cantrip' : spellLevel !== undefined ? `level ${spellLevel} spell` : 'spell';
      const schoolText = spellSchool ? ` (${spellSchool})` : '';

      const result = await ai.models.generateContent({
        model: config.model,
        contents: `Return a JSON object (no markdown) for the D&D 5e spell "${spellName}" (${levelText}${schoolText}).
Fields:
- "description": full spell text from the rules, include "At Higher Levels." section if applicable
- "usage": multiline string formatted as "Casting Time: ...\\nRange: ...\\nComponents: ...\\nDuration: ..."

Return only valid JSON like: {"description": "...", "usage": "Casting Time: 1 action\\nRange: 60 feet\\nComponents: V, S\\nDuration: Instantaneous"}`,
        config: {
          responseMimeType: 'application/json',
          maxOutputTokens: config.maxOutputTokens,
        },
      });

      let text = (result.text ?? '').trim();

      // Strip markdown code fences if present
      if (text.startsWith('```')) {
        text = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      }

      let details: ResolveSpellResponse;
      try {
        details = JSON.parse(text) as ResolveSpellResponse;
        if (!details.description || !details.usage) {
          throw new Error('Missing required fields in response');
        }
      } catch (parseError) {
        console.error('resolveSpell: Failed to parse AI response:', text);
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
