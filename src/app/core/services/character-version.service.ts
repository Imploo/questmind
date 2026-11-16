import { Injectable, inject, signal, computed, effect, resource } from '@angular/core';
import { Timestamp } from 'firebase/firestore';
import { CharacterVersion } from '../models/schemas/character.schema';
import { DndCharacter, LimitedUses } from '../../shared/models/dnd-character.model';
import { CharacterVersionRepositoryFactory } from '../../shared/repository/character-version.repository';
import { CharacterRepository } from '../../shared/repository/character.repository';

function stripUndefined(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  if (obj instanceof Timestamp) return obj;
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (value !== undefined) {
        result[key] = stripUndefined(value);
      }
    }
    return result;
  }
  return obj;
}

type VersionRecord = CharacterVersion & Record<string, unknown>;

/** A looked-up text and the key of the class, race and level it was looked up for. */
export interface ResolvedFeatureText {
  description: string;
  resolvedFor: string;
}

export interface ResolvedSpellText extends ResolvedFeatureText {
  usage: string;
}

/** An entry takes a looked-up text when it has none, or has one that was looked up for another context. */
function isOutdated(entry: { description?: string; resolvedFor?: string }, details: ResolvedFeatureText): boolean {
  return !entry.description || entry.resolvedFor !== details.resolvedFor;
}

@Injectable({ providedIn: 'root' })
export class CharacterVersionService {
  private readonly versionRepoFactory = inject(CharacterVersionRepositoryFactory);
  private readonly characterRepo = inject(CharacterRepository);

  readonly activeCharacterId = signal<string | null>(null);

  private readonly activeRepoResource = resource({
    params: () => {
      const id = this.activeCharacterId();
      if (!id) return undefined;
      return { characterId: id };
    },
    loader: async ({ params }) => {
      const repo = this.versionRepoFactory.create(params.characterId);
      await repo.waitForData();
      return repo;
    },
  });

  /** Every version of the open character, newest first, kept up to date by a live listener. */
  readonly versions = computed<CharacterVersion[]>(() => {
    const repo = this.activeRepoResource.value();
    return repo ? repo.get() as unknown as CharacterVersion[] : [];
  });

  constructor() {
    effect((onCleanup) => {
      const repo = this.activeRepoResource.value();
      if (repo) {
        onCleanup(() => repo.destroy());
      }
    });
  }

  async createInitialVersion(characterId: string, characterData: DndCharacter, preGeneratedVersionId?: string): Promise<string> {
    const versionId = preGeneratedVersionId ?? crypto.randomUUID();
    const now = Timestamp.now();

    const version: CharacterVersion = {
      id: versionId,
      versionNumber: 1,
      character: characterData,
      commitMessage: 'Initial character creation',
      source: 'manual',
      createdAt: now,
    };

    const repo = this.versionRepoFactory.create(characterId);
    await repo.update(stripUndefined(version) as VersionRecord);

    return versionId;
  }

  async getVersion(characterId: string, versionId: string): Promise<CharacterVersion | null> {
    const repo = this.versionRepoFactory.create(characterId);
    await repo.waitForData();
    const version = await repo.getByKey(versionId) as CharacterVersion | null;
    repo.destroy();
    return version;
  }

  /**
   * Put the character on another of its saved versions. Nothing is copied: the
   * character only tracks which version is the active one.
   */
  async activateVersion(characterId: string, versionId: string): Promise<void> {
    await this.characterRepo.patch(characterId, {
      activeVersionId: versionId,
      updatedAt: Timestamp.now(),
    });
  }

  async patchSpellDetails(
    characterId: string,
    activeVersionId: string,
    spellName: string,
    details: ResolvedSpellText
  ): Promise<void> {
    const { description, usage, resolvedFor } = details;
    const repo = this.versionRepoFactory.create(characterId);
    await repo.waitForData();
    const version = await repo.getByKey(activeVersionId) as CharacterVersion | null;
    if (!version) {
      repo.destroy();
      return;
    }
    const spells = version.character.spellcasting?.spells ?? [];
    const updated = spells.map(spell => {
      if (typeof spell === 'string') return spell;
      if (spell.name.toLowerCase() === spellName.toLowerCase()) return { ...spell, description, usage, resolvedFor };
      return spell;
    });
    await repo.patch(activeVersionId, { 'character.spellcasting.spells': updated });
    repo.destroy();
  }

  async patchFeatureDescription(
    characterId: string,
    activeVersionId: string,
    featureName: string,
    details: ResolvedFeatureText
  ): Promise<void> {
    const { description, resolvedFor } = details;
    const repo = this.versionRepoFactory.create(characterId);
    await repo.waitForData();
    const version = await repo.getByKey(activeVersionId) as CharacterVersion | null;
    if (!version) {
      repo.destroy();
      return;
    }
    const features = version.character.featuresAndTraits ?? [];
    const updated = features.map(feature => {
      if (typeof feature === 'string') return feature;
      if (feature.name.toLowerCase() === featureName.toLowerCase()) return { ...feature, description, resolvedFor };
      return feature;
    });
    await repo.patch(activeVersionId, { 'character.featuresAndTraits': updated });
    repo.destroy();
  }

  /**
   * Add, change or (uses: null) remove the uses tracker of a feature or spell on a version.
   * The tracker is part of the build, so it lives on the version; how many uses are spent
   * is play state and lives on the character.
   */
  async patchUses(
    characterId: string,
    versionId: string,
    owner: 'feature' | 'spell',
    name: string,
    uses: LimitedUses | null
  ): Promise<void> {
    const repo = this.versionRepoFactory.create(characterId);
    await repo.waitForData();
    const version = await repo.getByKey(versionId) as CharacterVersion | null;
    if (!version) {
      repo.destroy();
      return;
    }
    const target = name.toLowerCase();
    const withUses = <T extends { name: string; uses?: LimitedUses }>(entry: T): T => {
      if (entry.name.toLowerCase() !== target) return entry;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { uses: _previous, ...rest } = entry;
      return (uses ? { ...rest, uses } : rest) as T;
    };

    if (owner === 'feature') {
      const features = version.character.featuresAndTraits ?? [];
      await repo.patch(versionId, {
        'character.featuresAndTraits': features.map(feature => (typeof feature === 'string' ? feature : withUses(feature))),
      });
    } else {
      const spells = version.character.spellcasting?.spells ?? [];
      await repo.patch(versionId, {
        'character.spellcasting.spells': spells.map(spell => (typeof spell === 'string' ? spell : withUses(spell))),
      });
    }
    repo.destroy();
  }

  /**
   * Store looked-up spell and feature texts on a version in one write. Used after
   * resolving many entries at once, so the separate per-entry patches (which each
   * rewrite the whole list) cannot overwrite each other.
   */
  async patchResolvedEntries(
    characterId: string,
    versionId: string,
    spells: Map<string, ResolvedSpellText>,
    features: Map<string, ResolvedFeatureText>
  ): Promise<void> {
    if (!spells.size && !features.size) return;
    const repo = this.versionRepoFactory.create(characterId);
    await repo.waitForData();
    const version = await repo.getByKey(versionId) as CharacterVersion | null;
    if (!version) {
      repo.destroy();
      return;
    }
    const patch: Record<string, unknown> = {};
    const currentSpells = version.character.spellcasting?.spells;
    if (spells.size && currentSpells) {
      patch['character.spellcasting.spells'] = currentSpells.map(spell => {
        if (typeof spell === 'string') return spell;
        const details = spells.get(spell.name.toLowerCase());
        return details && isOutdated(spell, details) ? { ...spell, ...details } : spell;
      });
    }
    if (features.size && version.character.featuresAndTraits) {
      patch['character.featuresAndTraits'] = version.character.featuresAndTraits.map(feature => {
        if (typeof feature === 'string') return feature;
        const details = features.get(feature.name.toLowerCase());
        return details && isOutdated(feature, details) ? { ...feature, ...details } : feature;
      });
    }
    if (Object.keys(patch).length) {
      await repo.patch(versionId, patch);
    }
    repo.destroy();
  }
}
