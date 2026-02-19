import { inject, Injectable } from '@angular/core';
import { Firestore, QueryConstraint, orderBy } from 'firebase/firestore';
import { FirestoreRepository } from './firestore-repository';
import { CharacterImage } from '../../core/models/schemas/character-image.schema';
import { FirebaseService } from '../../core/firebase.service';

export class CharacterImageRepository extends FirestoreRepository<CharacterImage & Record<string, unknown>, 'id'> {
  constructor(firestore: Firestore, characterId: string) {
    super(firestore, `characters/${characterId}/images`, 'id');
  }

  protected override getConstraints(): QueryConstraint[] {
    return [orderBy('createdAt', 'desc')];
  }
}

@Injectable({ providedIn: 'root' })
export class CharacterImageRepositoryFactory {
  private readonly firestore = inject(FirebaseService).requireFirestore();

  create(characterId: string): CharacterImageRepository {
    return new CharacterImageRepository(this.firestore, characterId);
  }
}
