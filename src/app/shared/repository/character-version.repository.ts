import { inject, Injectable } from '@angular/core';
import { Firestore, QueryConstraint, orderBy } from 'firebase/firestore';
import { FirestoreRepository } from './firestore-repository';
import { CharacterVersion } from '../../core/models/schemas/character.schema';
import { FirebaseService } from '../../core/firebase.service';

export class CharacterVersionRepository extends FirestoreRepository<CharacterVersion & Record<string, unknown>, 'id'> {
  constructor(firestore: Firestore, characterId: string) {
    super(firestore, `characters/${characterId}/versions`, 'id');
  }

  protected override getConstraints(): QueryConstraint[] {
    return [orderBy('versionNumber', 'desc')];
  }
}

@Injectable({ providedIn: 'root' })
export class CharacterVersionRepositoryFactory {
  private readonly firestore = inject(FirebaseService).requireFirestore();

  create(characterId: string): CharacterVersionRepository {
    return new CharacterVersionRepository(this.firestore, characterId);
  }
}
