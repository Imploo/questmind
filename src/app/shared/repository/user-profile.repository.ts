import { inject, Injectable } from '@angular/core';
import { Firestore } from 'firebase/firestore';
import { FirestoreDocumentRepository } from './firestore-document-repository';
import type { UserProfile } from '../../core/models/user.model';
import { FirebaseService } from '../../core/firebase.service';

export class UserProfileRepository extends FirestoreDocumentRepository<UserProfile & Record<string, unknown>> {
  constructor(firestore: Firestore, userId: string) {
    super(firestore, `users/${userId}`);
  }
}

@Injectable({ providedIn: 'root' })
export class UserProfileRepositoryFactory {
  private readonly firestore = inject(FirebaseService).requireFirestore();

  create(userId: string): UserProfileRepository {
    return new UserProfileRepository(this.firestore, userId);
  }
}
