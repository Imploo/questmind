import { Injectable } from '@angular/core';
import { QueryConstraint, orderBy } from 'firebase/firestore';
import { FirestoreRepository } from './firestore-repository';
import { CharacterImage } from '../../core/models/schemas/character-image.schema';

export class CharacterImageRepository extends FirestoreRepository<CharacterImage & Record<string, unknown>, 'id'> {
  constructor(characterId: string) {
    super(`characters/${characterId}/images`, 'id');
  }

  protected override getConstraints(): QueryConstraint[] {
    return [orderBy('createdAt', 'desc')];
  }
}

@Injectable({ providedIn: 'root' })
export class CharacterImageRepositoryFactory {
  create(characterId: string): CharacterImageRepository {
    return new CharacterImageRepository(characterId);
  }
}
