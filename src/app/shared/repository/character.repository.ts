import { Injectable, inject } from '@angular/core';
import { QueryConstraint, where, orderBy } from 'firebase/firestore';
import { FirestoreRepository } from './firestore-repository';
import { Character } from '../../core/models/schemas/character.schema';
import { AuthService } from '../../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class CharacterRepository extends FirestoreRepository<Character & Record<string, unknown>, 'id'> {
  private readonly authService = inject(AuthService);

  constructor() {
    super('characters', 'id');
  }

  protected override getConstraints(): QueryConstraint[] {
    const user = this.authService.currentUser();
    if (!user) {
      // Return impossible constraint to get empty results
      return [where('userId', '==', '__none__')];
    }
    return [
      where('userId', '==', user.uid),
      orderBy('updatedAt', 'desc'),
    ];
  }
}
