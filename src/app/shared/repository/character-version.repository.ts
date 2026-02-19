import { Injectable } from '@angular/core';
import { QueryConstraint, orderBy } from 'firebase/firestore';
import { FirestoreRepository } from './firestore-repository';
import { CharacterVersion } from '../../core/models/schemas/character.schema';

export class CharacterVersionRepository extends FirestoreRepository<CharacterVersion & Record<string, unknown>, 'id'> {
  constructor(characterId: string) {
    super(`characters/${characterId}/versions`, 'id');
  }

  protected override getConstraints(): QueryConstraint[] {
    return [orderBy('versionNumber', 'desc')];
  }
}

@Injectable({ providedIn: 'root' })
export class CharacterVersionRepositoryFactory {
  create(characterId: string): CharacterVersionRepository {
    return new CharacterVersionRepository(characterId);
  }
}
