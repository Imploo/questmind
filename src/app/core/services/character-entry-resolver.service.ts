import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { httpsCallable } from 'firebase/functions';
import { FirebaseService } from '../firebase.service';
import { lookupSpellFromJson, SpellDetails } from '../../shared/utils/spell-lookup';
import { lookupFeatureFromJson, FeatureDetails } from '../../shared/utils/feature-lookup';
import { ResolutionContext, resolutionKey } from '../../shared/utils/resolution-context';

export interface SpellToResolve {
  name: string;
  level?: number;
  school?: string;
}

export interface FeatureToResolve {
  name: string;
  source?: string;
}

/** A looked-up text, with the key of the context (class, race, level) it was looked up for. */
export type Resolved<T> = T & { resolvedFor: string };

/**
 * Looks up the rules text of a spell or feature for one character: first in the
 * bundled SRD data (Spell.json / ClassFeature.json), then through the resolveSpell /
 * resolveFeature Cloud Functions, which ask Gemini and store the result on the
 * active version. Both take the character's class, race, level and other features
 * into account, so a druid gets the druid's Spellcasting, nothing it only gets at a
 * higher level, and of Metamagic only the options it chose.
 */
@Injectable({ providedIn: 'root' })
export class CharacterEntryResolverService {
  private readonly http = inject(HttpClient);
  private readonly firebase = inject(FirebaseService);

  /** Bundled data only; no network call beyond the static JSON. Without a context: the full text. */
  lookupSpellLocally(name: string, context?: ResolutionContext): Promise<SpellDetails | null> {
    return lookupSpellFromJson(this.http, name, context);
  }

  lookupFeatureLocally(feature: FeatureToResolve, context: ResolutionContext): Promise<FeatureDetails | null> {
    return lookupFeatureFromJson(this.http, feature, context);
  }

  async resolveSpell(
    characterId: string | null,
    spell: SpellToResolve,
    context: ResolutionContext
  ): Promise<Resolved<SpellDetails>> {
    const resolvedFor = resolutionKey(context);
    const local = await this.lookupSpellLocally(spell.name, context);
    if (local) return { ...local, resolvedFor };

    const fn = httpsCallable<unknown, { description: string; usage: string }>(
      this.firebase.requireFunctions(),
      'resolveSpell'
    );
    const result = await fn({
      characterId,
      spellName: spell.name,
      spellLevel: spell.level,
      spellSchool: spell.school,
      ...this.characterFields(context),
      maxSpellSlotLevel: context.maxSpellSlotLevel,
    });
    return { ...result.data, resolvedFor };
  }

  async resolveFeature(
    characterId: string | null,
    feature: FeatureToResolve,
    context: ResolutionContext
  ): Promise<Resolved<FeatureDetails>> {
    const resolvedFor = resolutionKey(context);
    const local = await this.lookupFeatureLocally(feature, context);
    if (local) return { ...local, resolvedFor };

    const fn = httpsCallable<unknown, { description: string }>(
      this.firebase.requireFunctions(),
      'resolveFeature'
    );
    const result = await fn({
      characterId,
      featureName: feature.name,
      featureSource: feature.source,
      ...this.characterFields(context),
      characterFeatures: context.features,
    });
    return { ...result.data, resolvedFor };
  }

  private characterFields(context: ResolutionContext) {
    return {
      characterClass: context.class,
      characterRace: context.race,
      characterLevel: context.level,
    };
  }
}
