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

  // Helper to create the very first version when a character is created
  async createInitialVersion(userId: string, characterId: string, characterData: DndCharacter): Promise<string> {
    if (!this.db) throw new Error('Firestore is not configured');

    // Validate character data with Zod
    const validatedData = DndCharacterSchema.parse(characterData);

    const versionId = doc(collection(this.db, 'users', userId, 'characters', characterId, 'versions')).id;
    const now = Timestamp.now();

    const version: CharacterVersion = {
      id: versionId,
      versionNumber: 1,
      character: validatedData,
      commitMessage: 'Initial character creation',
      source: 'manual',
      createdAt: now,
    };

    const versionRef = doc(this.db, 'users', userId, 'characters', characterId, 'versions', versionId);
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

    // Validate character data with Zod
    const validatedData = DndCharacterSchema.parse(characterData);

    // Get the latest version number
    const versionsRef = collection(this.db, 'users', user.uid, 'characters', characterId, 'versions');
    const q = query(versionsRef, orderBy('versionNumber', 'desc')); // Limit 1 would be better if supported easily, but this is fine for now
    const snapshot = await getDocs(q);

    let nextVersionNumber = 1;
    if (!snapshot.empty) {
      const latestVersion = snapshot.docs[0].data() as CharacterVersion;
      nextVersionNumber = latestVersion.versionNumber + 1;
    }

    const versionId = doc(versionsRef).id;
    const now = Timestamp.now();

    const version: any = {
      id: versionId,
      versionNumber: nextVersionNumber,
      character: validatedData,
      commitMessage,
      source,
      createdAt: now,
    };

    // Only add restoredFromVersionId if it's defined (Firestore doesn't support undefined)
    if (restoredFromVersionId) {
      version.restoredFromVersionId = restoredFromVersionId;
    }

    const versionRef = doc(this.db, 'users', user.uid, 'characters', characterId, 'versions', versionId);
    await setDoc(versionRef, version);

    // Update the character's activeVersionId
    const characterRef = doc(this.db, 'users', user.uid, 'characters', characterId);
    await updateDoc(characterRef, {
      activeVersionId: versionId,
      updatedAt: now
    });

    return versionId;
  }

  async getVersions(characterId: string): Promise<CharacterVersion[]> {
    const user = this.authService.currentUser();
    if (!user || !this.db) return [];

    const versionsRef = collection(this.db, 'users', user.uid, 'characters', characterId, 'versions');
    const q = query(versionsRef, orderBy('versionNumber', 'desc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => doc.data() as CharacterVersion);
  }

  async getVersion(characterId: string, versionId: string): Promise<CharacterVersion | null> {
    const user = this.authService.currentUser();
    if (!user || !this.db) return null;

    const versionRef = doc(this.db, 'users', user.uid, 'characters', characterId, 'versions', versionId);
    const snapshot = await getDoc(versionRef);

    if (!snapshot.exists()) return null;

    const data = snapshot.data() as CharacterVersion;

    // Validate character data with Zod (now more lenient with defaults)
    try {
      data.character = DndCharacterSchema.parse(data.character);
    } catch (error) {
      console.error('Invalid character data detected:', error);
      // If validation still fails, return null or throw
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
