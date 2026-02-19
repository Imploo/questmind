import { Injectable, inject, computed } from '@angular/core';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import { toObservable } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { FirebaseService } from '../firebase.service';
import { Character } from '../models/schemas/character.schema';
import { DndCharacter } from '../../shared/models/dnd-character.model';
import { CharacterVersionService } from './character-version.service';
import { CharacterRepository } from '../../shared/repository/character.repository';

@Injectable({ providedIn: 'root' })
export class CharacterService {
  private readonly authService = inject(AuthService);
  private readonly firebase = inject(FirebaseService);
  private readonly characterVersionService = inject(CharacterVersionService);
  private readonly characterRepo = inject(CharacterRepository);

  get characters() {
    return this.characterRepo.get;
  }

  async createCharacter(name: string, initialData: DndCharacter): Promise<string> {
    const user = this.authService.currentUser();
    if (!user) throw new Error('User not authenticated');

    const db = this.firebase.requireFirestore();
    const characterId = doc(collection(db, 'characters')).id;
    const versionId = doc(collection(db, 'characters', characterId, 'versions')).id;
    const now = Timestamp.now();

    const character: Character = {
      id: characterId,
      userId: user.uid,
      name,
      activeVersionId: versionId,
      campaignId: null,
      createdAt: now,
      updatedAt: now,
    };

    const characterRef = doc(db, 'characters', characterId);
    await setDoc(characterRef, character);

    await this.characterVersionService.createInitialVersion(
      characterId,
      initialData,
      versionId
    );

    return characterId;
  }

  async getCharacters(): Promise<Character[]> {
    await this.characterRepo.waitForData();
    return this.characterRepo.get() as Character[];
  }

  async getCharacter(characterId: string): Promise<Character | null> {
    await this.characterRepo.waitForData();
    return await this.characterRepo.getByKey(characterId) as Character | null;
  }

  watchCharacter(characterId: string): Observable<Character | null> {
    const charSignal = computed(() => {
      const characters = this.characterRepo.get() as unknown as (Character & Record<string, unknown>)[];
      return characters.find(c => c.id === characterId) as Character | null ?? null;
    });
    return toObservable(charSignal);
  }

  async updateCharacter(characterId: string, updates: Partial<Pick<Character, 'name' | 'campaignId'>>): Promise<void> {
    const user = this.authService.currentUser();
    if (!user) return;

    const db = this.firebase.requireFirestore();
    const characterRef = doc(db, 'characters', characterId);
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
