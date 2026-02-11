import { Injectable, inject } from '@angular/core';
import {
  collection,
  doc,
  getDocs,
  query,
  orderBy,
  type Firestore,
  deleteDoc
} from 'firebase/firestore';
import { AuthService } from '../../auth/auth.service';
import { FirebaseService } from '../firebase.service';
import { CharacterImage } from '../models/schemas/character-image.schema';

@Injectable({ providedIn: 'root' })
export class CharacterImageService {
  private readonly authService = inject(AuthService);
  private readonly firebase = inject(FirebaseService);
  private readonly db: Firestore | null;

  constructor() {
    this.db = this.firebase.firestore;
  }

  async getImages(characterId: string): Promise<CharacterImage[]> {
    if (!this.db) return [];

    const imagesRef = collection(this.db, 'characters', characterId, 'images');
    const q = query(imagesRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => doc.data() as CharacterImage);
  }

  async deleteImage(characterId: string, imageId: string): Promise<void> {
    const user = this.authService.currentUser();
    if (!user || !this.db) return;

    const imageRef = doc(this.db, 'characters', characterId, 'images', imageId);
    await deleteDoc(imageRef);
  }
}
