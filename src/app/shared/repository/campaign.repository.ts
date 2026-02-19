import { Injectable, inject } from '@angular/core';
import {
  collection,
  getDocs,
  query,
  where,
  type Firestore,
} from 'firebase/firestore';
import { FirebaseService } from '../../core/firebase.service';

@Injectable({ providedIn: 'root' })
export class CampaignRepository {
  private readonly db: Firestore | null;

  constructor() {
    const firebase = inject(FirebaseService);
    this.db = firebase.firestore;
  }

  async findUserByEmail(email: string): Promise<{ uid: string; email: string } | null> {
    if (!this.db) {
      return null;
    }
    const normalizedEmail = email.trim().toLowerCase();
    const usersRef = collection(this.db, 'users');
    const q = query(usersRef, where('email', '==', normalizedEmail));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const docSnap = snapshot.docs[0];
    return {
      uid: docSnap.id,
      email: docSnap.data()['email'],
    };
  }
}
