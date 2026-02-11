import { Injectable, inject } from '@angular/core';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  orderBy,
  Timestamp,
  type Firestore
} from 'firebase/firestore';
import { AuthService } from '../../auth/auth.service';
import { FirebaseService } from '../firebase.service';
import { CharacterVersion } from '../models/schemas/character.schema';
import { DndCharacter, DndCharacterSchema } from '../../shared/schemas/dnd-character.schema';

@Injectable({ providedIn: 'root' })
export class CharacterVersionService {
  private readonly authService = inject(AuthService);
  private readonly firebase = inject(FirebaseService);
  private readonly db: Firestore | null;

  constructor() {
    this.db = this.firebase.firestore;
  }

  async createInitialVersion(characterId: string, characterData: DndCharacter): Promise<string> {
    if (!this.db) throw new Error('Firestore is not configured');

    const validatedData = DndCharacterSchema.parse(characterData);

    const versionId = doc(collection(this.db, 'characters', characterId, 'versions')).id;
    const now = Timestamp.now();

    const version: CharacterVersion = {
      id: versionId,
      versionNumber: 1,
      character: validatedData,
      commitMessage: 'Initial character creation',
      source: 'manual',
      createdAt: now,
    };

    const versionRef = doc(this.db, 'characters', characterId, 'versions', versionId);
    await setDoc(versionRef, version);

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

    const validatedData = DndCharacterSchema.parse(characterData);

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
      character: validatedData,
      commitMessage,
      source,
      createdAt: now,
    };

    if (restoredFromVersionId) {
      version.restoredFromVersionId = restoredFromVersionId;
    }

    const versionRef = doc(this.db, 'characters', characterId, 'versions', versionId);
    await setDoc(versionRef, version);

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

    try {
      data.character = DndCharacterSchema.parse(data.character);
    } catch (error) {
      console.error('Invalid character data detected:', error);
      throw error;
    }

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
}
