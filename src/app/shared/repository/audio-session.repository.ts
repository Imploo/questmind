import { Injectable } from '@angular/core';
import { QueryConstraint, orderBy } from 'firebase/firestore';
import { FirestoreRepository } from './firestore-repository';
import { AudioSessionRecord } from '../../audio/services/audio-session.models';

export class AudioSessionRepository extends FirestoreRepository<AudioSessionRecord & Record<string, unknown>, 'id'> {
  constructor(campaignId: string) {
    super(`campaigns/${campaignId}/audioSessions`, 'id');
  }

  protected override getConstraints(): QueryConstraint[] {
    return [orderBy('createdAt', 'desc')];
  }
}

@Injectable({ providedIn: 'root' })
export class AudioSessionRepositoryFactory {
  create(campaignId: string): AudioSessionRepository {
    return new AudioSessionRepository(campaignId);
  }
}
