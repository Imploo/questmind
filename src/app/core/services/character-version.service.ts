import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  setDoc,
  updateDoc,
  onSnapshot,
  orderBy,
  limit,
  Timestamp,
  type Firestore
} from 'firebase/firestore';
import { AuthService } from '../../auth/auth.service';
import { FirebaseService } from '../firebase.service';
import { CharacterVersion } from '../models/schemas/character.schema';
import { DndCharacter } from '../../shared/models/dnd-character.model';

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
  private readonly db: Firestore | null;

  constructor() {
    this.db = this.firebase.firestore;
  }

  async createInitialVersion(characterId: string, characterData: DndCharacter, preGeneratedVersionId?: string): Promise<string> {
    if (!this.db) throw new Error('Firestore is not configured');

    const versionId = preGeneratedVersionId ?? doc(collection(this.db, 'characters', characterId, 'versions')).id;
    const now = Timestamp.now();

    const version: CharacterVersion = {
      id: versionId,
      versionNumber: 1,
      character: characterData,
      commitMessage: 'Initial character creation',
      source: 'manual',
      createdAt: now,
    };

    const versionRef = doc(this.db, 'characters', characterId, 'versions', versionId);
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
    if (!this.db) throw new Error('Firestore is not configured');

    const versionsRef = collection(this.db, 'characters', characterId, 'versions');
    const q = query(versionsRef, orderBy('versionNumber', 'desc'));
    const snapshot = await getDocs(q);

    let nextVersionNumber = 1;
    if (!snapshot.empty) {
      const latestVersion = snapshot.docs[0].data() as CharacterVersion;
      nextVersionNumber = latestVersion.versionNumber + 1;
    }

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

    const versionRef = doc(this.db, 'characters', characterId, 'versions', versionId);
    await setDoc(versionRef, stripUndefined(version) as CharacterVersion);

    const characterRef = doc(this.db, 'characters', characterId);
    await updateDoc(characterRef, {
      activeVersionId: versionId,
      updatedAt: now
    });

    return versionId;
  }

  async getVersions(characterId: string): Promise<CharacterVersion[]> {
    if (!this.db) return [];

    const versionsRef = collection(this.db, 'characters', characterId, 'versions');
    const q = query(versionsRef, orderBy('versionNumber', 'desc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => doc.data() as CharacterVersion);
  }

  async getVersion(characterId: string, versionId: string): Promise<CharacterVersion | null> {
    if (!this.db) return null;

    const versionRef = doc(this.db, 'characters', characterId, 'versions', versionId);
    const snapshot = await getDoc(versionRef);

    if (!snapshot.exists()) return null;

    const data = snapshot.data() as CharacterVersion;

    return data;
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
    if (!this.db) return;
    const versionRef = doc(this.db, 'characters', characterId, 'versions', activeVersionId);
    const snapshot = await getDoc(versionRef);
    if (!snapshot.exists()) return;
    const data = snapshot.data() as CharacterVersion;
    const spells = data.character.spellcasting?.spells ?? [];
    const updated = spells.map(spell => {
      if (typeof spell === 'string') return spell;
      if (spell.name.toLowerCase() === spellName.toLowerCase()) return { ...spell, description, usage };
      return spell;
    });
    await updateDoc(versionRef, { 'character.spellcasting.spells': updated });
  }

  watchLatestVersion(characterId: string): Observable<CharacterVersion | null> {
    return new Observable(subscriber => {
      if (!this.db) {
        subscriber.next(null);
        subscriber.complete();
        return;
      }

      const versionsRef = collection(this.db, 'characters', characterId, 'versions');
      const q = query(versionsRef, orderBy('versionNumber', 'desc'), limit(1));

      const unsubscribe = onSnapshot(q, snapshot => {
        if (snapshot.empty) {
          subscriber.next(null);
        } else {
          subscriber.next(snapshot.docs[0].data() as CharacterVersion);
        }
      }, error => {
        subscriber.error(error);
      });

      return unsubscribe;
    });
  }

  async commitDraft(characterId: string, draftVersionId: string): Promise<void> {
    if (!this.db) throw new Error('Firestore is not configured');
    const draftRef = doc(this.db, 'characters', characterId, 'versions', draftVersionId);
    await updateDoc(draftRef, { isDraft: false });
    await updateDoc(doc(this.db, 'characters', characterId), {
      activeVersionId: draftVersionId,
      updatedAt: Timestamp.now(),
    });
  }

  async dismissDraft(characterId: string, draftVersionId: string): Promise<void> {
    if (!this.db) throw new Error('Firestore is not configured');
    const draftRef = doc(this.db, 'characters', characterId, 'versions', draftVersionId);
    await deleteDoc(draftRef);
  }
}
