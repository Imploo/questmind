import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import { doc, deleteDoc } from 'firebase/firestore';
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
  private readonly injector = inject(Injector);

  async getImages(characterId: string): Promise<CharacterImage[]> {
    return new Promise<CharacterImage[]>((resolve) => {
      runInInjectionContext(this.injector, () => {
        const repo = this.imageRepoFactory.create(characterId);
        void repo.waitForData().then(() => {
          const result = [...repo.get() as unknown as CharacterImage[]];
          repo.destroy();
          resolve(result);
        });
      });
    });
  }

  async deleteImage(image: CharacterImage): Promise<void> {
    const user = this.authService.currentUser();
    if (!user) return;

    // Delete from Cloud Storage if we have the storage path
    if (image.storagePath && this.firebase.storage) {
      const storageRef = ref(this.firebase.storage, image.storagePath);
      await deleteObject(storageRef);
    }

    // Delete metadata from Firestore
    const firestore = this.firebase.requireFirestore();
    const imageRef = doc(firestore, 'characters', image.characterId, 'images', image.id);
    await deleteDoc(imageRef);
  }
}
