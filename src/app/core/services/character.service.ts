import { Injectable, inject } from '@angular/core';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  Timestamp,
  type Firestore,
  orderBy
} from 'firebase/firestore';
import { AuthService } from '../../auth/auth.service';
import { FirebaseService } from '../firebase.service';
import { Character } from '../models/schemas/character.schema';
import { DndCharacter } from '../../shared/schemas/dnd-character.schema';
import { CharacterVersionService } from './character-version.service';

@Injectable({ providedIn: 'root' })
export class CharacterService {
  private readonly authService = inject(AuthService);
  private readonly firebase = inject(FirebaseService);
  private readonly characterVersionService = inject(CharacterVersionService);
  private readonly db: Firestore | null;

  constructor() {
    this.db = this.firebase.firestore;
  }

  async createCharacter(name: string, initialData: DndCharacter): Promise<string> {
    const user = this.authService.currentUser();
    if (!user) throw new Error('User not authenticated');
    if (!this.db) throw new Error('Firestore is not configured');

    const characterId = doc(collection(this.db, 'users', user.uid, 'characters')).id;
    const now = Timestamp.now();

    // Create the initial version first
    const versionId = await this.characterVersionService.createInitialVersion(
      user.uid,
      characterId,
      initialData
    );

    const character: Character = {
      id: characterId,
      userId: user.uid,
      name,
      activeVersionId: versionId,
      campaignId: null,
      createdAt: now,
      updatedAt: now,
    };

    const characterRef = doc(this.db, 'users', user.uid, 'characters', characterId);
    await setDoc(characterRef, character);

    return characterId;
  }

  async getCharacters(): Promise<Character[]> {
    const user = this.authService.currentUser();
    if (!user || !this.db) return [];

    const charactersRef = collection(this.db, 'users', user.uid, 'characters');
    const q = query(charactersRef, orderBy('updatedAt', 'desc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => doc.data() as Character);
  }

  async getCharacter(characterId: string): Promise<Character | null> {
    const user = this.authService.currentUser();
    if (!user || !this.db) return null;

    const characterRef = doc(this.db, 'users', user.uid, 'characters', characterId);
    const snapshot = await getDoc(characterRef);

    return snapshot.exists() ? (snapshot.data() as Character) : null;
  }

  async updateCharacter(characterId: string, updates: Partial<Pick<Character, 'name' | 'campaignId'>>): Promise<void> {
    const user = this.authService.currentUser();
    if (!user || !this.db) return;

    const characterRef = doc(this.db, 'users', user.uid, 'characters', characterId);
    await updateDoc(characterRef, {
      ...updates,
      updatedAt: Timestamp.now()
    });
  }

  async linkCampaign(characterId: string, campaignId: string): Promise<void> {
    await this.updateCharacter(characterId, { campaignId });
  }

  async unlinkCampaign(characterId: string): Promise<void> {
    await this.updateCharacter(characterId, { campaignId: null });
  }
}
