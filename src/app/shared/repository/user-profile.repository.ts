import { FirestoreDocumentRepository } from './firestore-document-repository';
import type { UserProfile } from '../../core/models/user.model';

export class UserProfileRepository extends FirestoreDocumentRepository<UserProfile & Record<string, unknown>> {
  constructor(userId: string) {
    super(`users/${userId}`);
  }
}

export class UserProfileRepositoryFactory {
  create(userId: string): UserProfileRepository {
    return new UserProfileRepository(userId);
  }
}
