import { Injectable, inject } from '@angular/core';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  query,
  orderBy,
  Timestamp,
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
    const user = this.authService.currentUser();
    if (!user || !this.db) return [];

    const imagesRef = collection(this.db, 'users', user.uid, 'characters', characterId, 'images');
    const q = query(imagesRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => doc.data() as CharacterImage);
  }

  async addImage(
    characterId: string,
    url: string,
    mimeType: string,
    versionId?: string
  ): Promise<string> {
    const user = this.authService.currentUser();
    if (!user) throw new Error('User not authenticated');
    if (!this.db) throw new Error('Firestore is not configured');

    const imageId = doc(collection(this.db, 'users', user.uid, 'characters', characterId, 'images')).id;

    const image: CharacterImage = {
      id: imageId,
      characterId,
      url,
      mimeType,
      versionId,
      createdAt: Timestamp.now(),
    };

    const imageRef = doc(this.db, 'users', user.uid, 'characters', characterId, 'images', imageId);
    await setDoc(imageRef, image);

    return imageId;
  }

  async deleteImage(characterId: string, imageId: string): Promise<void> {
    const user = this.authService.currentUser();
    if (!user || !this.db) return;

    const imageRef = doc(this.db, 'users', user.uid, 'characters', characterId, 'images', imageId);
    await deleteDoc(imageRef);
  }
}
