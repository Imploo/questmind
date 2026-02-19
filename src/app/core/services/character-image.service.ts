import { Injectable, inject } from '@angular/core';
import { ref, deleteObject } from 'firebase/storage';
import { AuthService } from '../../auth/auth.service';
import { FirebaseService } from '../firebase.service';
import { CharacterImage } from '../models/schemas/character-image.schema';
import { CharacterImageRepositoryFactory } from '../../shared/repository/character-image.repository';

@Injectable({ providedIn: 'root' })
export class CharacterImageService {
  private readonly authService = inject(AuthService);
  private readonly firebase = inject(FirebaseService);
  private readonly imageRepoFactory = inject(CharacterImageRepositoryFactory);

  async getImages(characterId: string): Promise<CharacterImage[]> {
    const repo = this.imageRepoFactory.create(characterId);
    await repo.waitForData();
    const result = [...repo.get() as unknown as CharacterImage[]];
    repo.destroy();

    return result.map(image => ({
      ...image,
      url: this.resolveImageUrl(image),
    }));
  }

  /** Builds a permanent download URL from storagePath. */
  private resolveImageUrl(image: CharacterImage): string {
    const bucket = this.firebase.app?.options?.storageBucket;
    if (!bucket) return image.url ?? '';

    return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(image.storagePath)}?alt=media`;
  }

  async deleteImage(image: CharacterImage): Promise<void> {
    const user = this.authService.currentUser();
    if (!user) return;

    // Delete from Cloud Storage if we have the storage path
    if (image.storagePath && this.firebase.storage) {
      const storageRef = ref(this.firebase.storage, image.storagePath);
      await deleteObject(storageRef);
    }

    // Delete metadata from Firestore via repository
    const repo = this.imageRepoFactory.create(image.characterId);
    await repo.delete(image.id);
  }
}
