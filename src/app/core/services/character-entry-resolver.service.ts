import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { httpsCallable } from 'firebase/functions';
import { FirebaseService } from '../firebase.service';
import { lookupSpellFromJson, SpellDetails } from '../../shared/utils/spell-lookup';
import { lookupFeatureFromJson, FeatureDetails } from '../../shared/utils/feature-lookup';

export interface SpellToResolve {
  name: string;
  level?: number;
  school?: string;
}

export interface FeatureToResolve {
  name: string;
  source?: string;
}

/**
 * Looks up the rules text of a spell or feature: first in the bundled SRD data
 * (Spell.json / ClassFeature.json), then through the resolveSpell / resolveFeature
 * Cloud Functions, which ask Gemini and store the result on the active version.
 */
@Injectable({ providedIn: 'root' })
export class CharacterEntryResolverService {
  private readonly http = inject(HttpClient);
  private readonly firebase = inject(FirebaseService);

  /** Bundled data only; no network call beyond the static JSON. */
  lookupSpellLocally(name: string): Promise<SpellDetails | null> {
    return lookupSpellFromJson(this.http, name);
  }

  lookupFeatureLocally(name: string): Promise<FeatureDetails | null> {
    return lookupFeatureFromJson(this.http, name);
  }

  async resolveSpell(characterId: string | null, spell: SpellToResolve): Promise<SpellDetails> {
    const local = await this.lookupSpellLocally(spell.name);
    if (local) return local;

    const fn = httpsCallable<unknown, { description: string; usage: string }>(
      this.firebase.requireFunctions(),
      'resolveSpell'
    );
    const result = await fn({
      characterId,
      spellName: spell.name,
      spellLevel: spell.level,
      spellSchool: spell.school,
    });
    return result.data;
  }

  async resolveFeature(
    characterId: string | null,
    feature: FeatureToResolve,
    character: { class: string; race: string }
  ): Promise<FeatureDetails> {
    const local = await this.lookupFeatureLocally(feature.name);
    if (local) return local;

    const fn = httpsCallable<unknown, { description: string }>(
      this.firebase.requireFunctions(),
      'resolveFeature'
    );
    const result = await fn({
      characterId,
      featureName: feature.name,
      featureSource: feature.source,
      characterClass: character.class,
      characterRace: character.race,
    });
    return result.data;
  }
}
