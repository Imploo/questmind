import { inject, Injectable } from '@angular/core';
import { Firestore, QueryConstraint, orderBy } from 'firebase/firestore';
import { FirestoreRepository } from './firestore-repository';
import { AudioSessionRecord } from '../../audio/services/audio-session.models';
import { FirebaseService } from '../../core/firebase.service';

export class AudioSessionRepository extends FirestoreRepository<AudioSessionRecord & Record<string, unknown>, 'id'> {
  constructor(firestore: Firestore, campaignId: string) {
    super(firestore, `campaigns/${campaignId}/audioSessions`, 'id');
  }

  protected override getConstraints(): QueryConstraint[] {
    return [orderBy('createdAt', 'desc')];
  }
}

@Injectable({ providedIn: 'root' })
export class AudioSessionRepositoryFactory {
  private readonly firestore = inject(FirebaseService).requireFirestore();

  create(campaignId: string): AudioSessionRepository {
    return new AudioSessionRepository(this.firestore, campaignId);
  }
}
