import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { GoogleGenAI } from '@google/genai';
import { getFirestore } from 'firebase-admin/firestore';
import { wrapCallable } from './utils/sentry-error-handler';
import { getAiFeatureConfig } from './utils/ai-settings';
import { SHARED_CORS } from './index';

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
      const { characterId, featureName, featureSource, characterClass, characterRace } = request.data;

      if (!characterId || !featureName) {
        throw new HttpsError('invalid-argument', 'Missing required fields: characterId, featureName');
      }

      const apiKey = process.env.GOOGLE_AI_API_KEY;
      if (!apiKey) {
        throw new HttpsError('failed-precondition', 'AI API key not configured');
      }

      const ai = new GoogleGenAI({ apiKey });
      const config = await getAiFeatureConfig('featureResolution');

      const contextParts: string[] = [];
      if (featureSource) contextParts.push(`source: ${featureSource}`);
      if (characterClass) contextParts.push(`class: ${characterClass}`);
      if (characterRace) contextParts.push(`race: ${characterRace}`);
      const contextText = contextParts.length > 0 ? ` (${contextParts.join(', ')})` : '';

      const result = await ai.models.generateContent({
        model: config.model,
        contents: `Return a JSON object (no markdown) for the D&D 5e feature/trait "${featureName}"${contextText}.
Fields:
- "description": full feature text from the rules, including any mechanical effects and level-based improvements

Return only valid JSON like: {"description": "..."}`,
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

      let details: ResolveFeatureResponse;
      try {
        details = JSON.parse(text) as ResolveFeatureResponse;
        if (!details.description) {
          throw new Error('Missing required fields in response');
        }
      } catch (parseError) {
        console.error('resolveFeature: Failed to parse AI response:', text);
        throw new HttpsError('internal', 'Failed to parse feature details from AI response');
      }

      // Patch Firestore active version (best-effort)
      try {
        const db = getFirestore();
        const charSnap = await db.collection('characters').doc(characterId).get();
        const activeVersionId = charSnap.data()?.['activeVersionId'] as string | undefined;

        if (activeVersionId) {
          const vRef = db.collection('characters').doc(characterId).collection('versions').doc(activeVersionId);
          const vSnap = await vRef.get();

          if (vSnap.exists) {
            const features = (vSnap.data()?.['character']?.['featuresAndTraits'] ?? []) as Array<string | Record<string, unknown>>;
            const updated = features.map(f => {
              if (typeof f === 'string') return f;
              if ((f['name'] as string)?.toLowerCase() === featureName.toLowerCase()) {
                return { ...f, description: details.description };
              }
              return f;
            });
            await vRef.update({ 'character.featuresAndTraits': updated });
          }
        }
      } catch (e) {
        console.error('resolveFeature: Firestore patch failed (non-fatal):', e);
      }

      return details;
    }
  )
);
