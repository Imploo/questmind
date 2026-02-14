import { Injectable } from '@angular/core';
import { getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

@Injectable({ providedIn: 'root' })
export class FirebaseService {
  readonly app: FirebaseApp | null;
  readonly auth: Auth | null;
  readonly firestore: Firestore | null;
  readonly functions: Functions | null;
  readonly storage: FirebaseStorage | null;

  constructor() {
    try {
      this.app = getApp();
      this.auth = getAuth(this.app);
      this.firestore = getFirestore(this.app);
      this.functions = getFunctions(this.app, 'europe-west1');
      this.storage = getStorage(this.app);
    } catch (error) {
      console.error('Firebase not initialized:', error);
      this.app = null;
      this.auth = null;
      this.firestore = null;
      this.functions = null;
      this.storage = null;
    }
  }

  requireAuth(): Auth {
    if (!this.auth) {
      throw new Error('Auth not initialized');
    }
    return this.auth;
  }

  requireFirestore(): Firestore {
    if (!this.firestore) {
      throw new Error('Firestore not initialized');
    }
    return this.firestore;
  }

  requireFunctions(): Functions {
    if (!this.functions) {
      throw new Error('Functions not initialized');
    }
    return this.functions;
  }

}
