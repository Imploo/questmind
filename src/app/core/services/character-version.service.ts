import { Injectable, inject, signal, computed, effect, resource } from '@angular/core';
import { Timestamp } from 'firebase/firestore';
import { AuthService } from '../../auth/auth.service';
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

@Injectable({ providedIn: 'root' })
export class CharacterVersionService {
  private readonly authService = inject(AuthService);
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

  readonly latestVersion = computed<CharacterVersion | null>(() => {
    const repo = this.activeRepoResource.value();
    if (!repo) return null;
    const versions = repo.get() as unknown as CharacterVersion[];
    return versions[0] ?? null;
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

  async createVersion(
    characterId: string,
    characterData: DndCharacter,
    commitMessage: string,
    source: 'ai' | 'restore' | 'manual',
    restoredFromVersionId?: string
  ): Promise<string> {
    const user = this.authService.currentUser();
    if (!user) throw new Error('User not authenticated');

    const repo = this.versionRepoFactory.create(characterId);
    await repo.waitForData();
    const versions = repo.get() as unknown as VersionRecord[];
    const latest = versions[0];
    const nextVersionNumber = latest ? latest.versionNumber + 1 : 1;

    const versionId = crypto.randomUUID();
    const now = Timestamp.now();

    const version: CharacterVersion = {
      id: versionId,
      versionNumber: nextVersionNumber,
      character: characterData,
      commitMessage,
      source,
      createdAt: now,
    };

    if (restoredFromVersionId) {
      version.restoredFromVersionId = restoredFromVersionId;
    }

    await repo.update(stripUndefined(version) as VersionRecord);
    repo.destroy();

    await this.characterRepo.patch(characterId, {
      activeVersionId: versionId,
      updatedAt: now
    });

    return versionId;
  }

  async getVersions(characterId: string): Promise<CharacterVersion[]> {
    const repo = this.versionRepoFactory.create(characterId);
    await repo.waitForData();
    const versions = [...repo.get() as unknown as CharacterVersion[]];
    repo.destroy();
    return versions;
  }

  async getVersion(characterId: string, versionId: string): Promise<CharacterVersion | null> {
    const repo = this.versionRepoFactory.create(characterId);
    await repo.waitForData();
    const version = await repo.getByKey(versionId) as CharacterVersion | null;
    repo.destroy();
    return version;
  }

  async restoreVersion(characterId: string, versionToRestore: CharacterVersion): Promise<string> {
    return this.createVersion(
      characterId,
      versionToRestore.character,
      `Restored version ${versionToRestore.versionNumber}`,
      'restore',
      versionToRestore.id
    );
  }

  async patchSpellDetails(
    characterId: string,
    activeVersionId: string,
    spellName: string,
    description: string,
    usage: string
  ): Promise<void> {
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
      if (spell.name.toLowerCase() === spellName.toLowerCase()) return { ...spell, description, usage };
      return spell;
    });
    await repo.patch(activeVersionId, { 'character.spellcasting.spells': updated });
    repo.destroy();
  }

  async patchFeatureDescription(
    characterId: string,
    activeVersionId: string,
    featureName: string,
    description: string
  ): Promise<void> {
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
      if (feature.name.toLowerCase() === featureName.toLowerCase()) return { ...feature, description };
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
    spells: Map<string, { description: string; usage?: string }>,
    features: Map<string, { description: string }>
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
        if (typeof spell === 'string' || spell.description) return spell;
        const details = spells.get(spell.name.toLowerCase());
        return details ? { ...spell, ...details } : spell;
      });
    }
    if (features.size && version.character.featuresAndTraits) {
      patch['character.featuresAndTraits'] = version.character.featuresAndTraits.map(feature => {
        if (typeof feature === 'string' || feature.description) return feature;
        const details = features.get(feature.name.toLowerCase());
        return details ? { ...feature, ...details } : feature;
      });
    }
    if (Object.keys(patch).length) {
      await repo.patch(versionId, patch);
    }
    repo.destroy();
  }

  async commitDraft(characterId: string, draftVersionId: string): Promise<void> {
    const repo = this.versionRepoFactory.create(characterId);
    await repo.patch(draftVersionId, { isDraft: false });

    await this.characterRepo.patch(characterId, {
      activeVersionId: draftVersionId,
      updatedAt: Timestamp.now(),
    });
  }

  async dismissDraft(characterId: string, draftVersionId: string): Promise<void> {
    const repo = this.versionRepoFactory.create(characterId);
    await repo.delete(draftVersionId);
  }
}
