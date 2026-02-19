import { Injectable, inject, signal, effect, untracked } from '@angular/core';
import {
  collection,
  doc,
  deleteDoc,
  setDoc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import { AuthService } from '../../auth/auth.service';
import { FirebaseService } from '../firebase.service';
import { CharacterVersion } from '../models/schemas/character.schema';
import { DndCharacter } from '../../shared/models/dnd-character.model';
import { CharacterVersionRepository, CharacterVersionRepositoryFactory } from '../../shared/repository/character-version.repository';

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

@Injectable({ providedIn: 'root' })
export class CharacterVersionService {
  private readonly authService = inject(AuthService);
  private readonly firebase = inject(FirebaseService);
  private readonly versionRepoFactory = inject(CharacterVersionRepositoryFactory);

  readonly activeCharacterId = signal<string | null>(null);
  private readonly activeRepo = signal<CharacterVersionRepository | null>(null);
  private readonly _latestVersion = signal<CharacterVersion | null>(null);
  readonly latestVersion = this._latestVersion.asReadonly();

  constructor() {
    effect(() => {
      const id = this.activeCharacterId();
      untracked(() => this.updateActiveRepo(id));
    });

    // Sync active repo data to latestVersion signal
    effect(() => {
      const repo = this.activeRepo();
      if (repo) {
        const versions = repo.get() as unknown as (CharacterVersion & Record<string, unknown>)[];
        this._latestVersion.set(versions[0] as CharacterVersion | null ?? null);
      } else {
        this._latestVersion.set(null);
      }
    });
  }

  createRepository(characterId: string): CharacterVersionRepository {
    return this.versionRepoFactory.create(characterId);
  }

  async createInitialVersion(characterId: string, characterData: DndCharacter, preGeneratedVersionId?: string): Promise<string> {
    const db = this.firebase.requireFirestore();
    if (!db) throw new Error('Firestore is not configured');

    const versionId = preGeneratedVersionId ?? doc(collection(db, 'characters', characterId, 'versions')).id;
    const now = Timestamp.now();

    const version: CharacterVersion = {
      id: versionId,
      versionNumber: 1,
      character: characterData,
      commitMessage: 'Initial character creation',
      source: 'manual',
      createdAt: now,
    };

    const versionRef = doc(db, 'characters', characterId, 'versions', versionId);
    await setDoc(versionRef, stripUndefined(version) as CharacterVersion);

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
    const db = this.firebase.requireFirestore();

    // Use a temporary repository to get the latest version number
    const tempRepo = this.versionRepoFactory.create(characterId);
    await tempRepo.waitForData();
    const versions = tempRepo.get() as unknown as (CharacterVersion & Record<string, unknown>)[];
    const latestVersion = versions[0];
    const nextVersionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;
    tempRepo.destroy();

    const versionsRef = collection(db, 'characters', characterId, 'versions');
    const versionId = doc(versionsRef).id;
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

    const versionRef = doc(db, 'characters', characterId, 'versions', versionId);
    await setDoc(versionRef, stripUndefined(version) as CharacterVersion);

    const characterRef = doc(db, 'characters', characterId);
    await updateDoc(characterRef, {
      activeVersionId: versionId,
      updatedAt: now
    });

    return versionId;
  }

  async getVersions(characterId: string): Promise<CharacterVersion[]> {
    const tempRepo = this.versionRepoFactory.create(characterId);
    await tempRepo.waitForData();
    const versions = [...tempRepo.get() as unknown as CharacterVersion[]];
    tempRepo.destroy();
    return versions;
  }

  async getVersion(characterId: string, versionId: string): Promise<CharacterVersion | null> {
    const tempRepo = this.versionRepoFactory.create(characterId);
    await tempRepo.waitForData();
    const version = await tempRepo.getByKey(versionId) as CharacterVersion | null;
    tempRepo.destroy();
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
    const db = this.firebase.requireFirestore();
    const version = await this.getVersion(characterId, activeVersionId);
    if (!version) return;
    const spells = version.character.spellcasting?.spells ?? [];
    const updated = spells.map(spell => {
      if (typeof spell === 'string') return spell;
      if (spell.name.toLowerCase() === spellName.toLowerCase()) return { ...spell, description, usage };
      return spell;
    });
    const versionRef = doc(db, 'characters', characterId, 'versions', activeVersionId);
    await updateDoc(versionRef, { 'character.spellcasting.spells': updated });
  }

  async patchFeatureDescription(
    characterId: string,
    activeVersionId: string,
    featureName: string,
    description: string
  ): Promise<void> {
    const db = this.firebase.requireFirestore();
    const version = await this.getVersion(characterId, activeVersionId);
    if (!version) return;
    const features = version.character.featuresAndTraits ?? [];
    const updated = features.map(feature => {
      if (typeof feature === 'string') return feature;
      if (feature.name.toLowerCase() === featureName.toLowerCase()) return { ...feature, description };
      return feature;
    });
    const versionRef = doc(db, 'characters', characterId, 'versions', activeVersionId);
    await updateDoc(versionRef, { 'character.featuresAndTraits': updated });
  }

  private updateActiveRepo(characterId: string | null): void {
    this.activeRepo()?.destroy();
    this.activeRepo.set(null);

    if (!characterId) {
      return;
    }

    this.activeRepo.set(this.versionRepoFactory.create(characterId));
  }

  async commitDraft(characterId: string, draftVersionId: string): Promise<void> {
    const db = this.firebase.requireFirestore();
    const draftRef = doc(db, 'characters', characterId, 'versions', draftVersionId);
    await updateDoc(draftRef, { isDraft: false });
    await updateDoc(doc(db, 'characters', characterId), {
      activeVersionId: draftVersionId,
      updatedAt: Timestamp.now(),
    });
  }

  async dismissDraft(characterId: string, draftVersionId: string): Promise<void> {
    const db = this.firebase.requireFirestore();
    const draftRef = doc(db, 'characters', characterId, 'versions', draftVersionId);
    await deleteDoc(draftRef);
  }
}
