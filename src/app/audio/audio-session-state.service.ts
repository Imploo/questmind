import { Injectable, signal, effect } from '@angular/core';
import { getApp, type FirebaseApp } from 'firebase/app';
import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  type Firestore
} from 'firebase/firestore';

import { AuthService } from '../auth/auth.service';
import {
  AudioSessionRecord,
  AudioUpload
} from './audio-session.models';

@Injectable({
  providedIn: 'root'
})
export class AudioSessionStateService {
  readonly sessions = signal<AudioSessionRecord[]>([]);
  private readonly app: FirebaseApp | null;
  private readonly db: Firestore | null;
  private activeUserId: string | null = null;
  private sessionsUnsubscribe?: () => void;

  constructor(private readonly authService: AuthService) {
    try {
      this.app = getApp();
      this.db = getFirestore(this.app);
    } catch (error) {
      console.error('Firebase not initialized:', error);
      this.app = null;
      this.db = null;
    }

    effect(() => {
      const user = this.authService.currentUser();
      if (user?.uid) {
        this.setActiveUser(user.uid);
      } else {
        this.clearSessions();
      }
    });
  }

  getSessions(): AudioSessionRecord[] {
    return this.sessions();
  }

  getSession(id: string): AudioSessionRecord | undefined {
    return this.sessions().find(session => session.id === id);
  }

  getActiveUserId(): string | null {
    return this.activeUserId;
  }

  isAuthenticated(): boolean {
    return this.activeUserId !== null;
  }

  createSessionDraft(upload: AudioUpload): AudioSessionRecord {
    this.setActiveUser(upload.userId);
    const now = new Date().toISOString();
    const id = this.generateId();
    const title = upload.sessionName?.trim() || this.defaultTitle(upload.file.name);
    const record: AudioSessionRecord = {
      id,
      title,
      content: '',
      sessionDate: upload.sessionDate,
      audioFileName: upload.file.name,
      storageUrl: '',
      createdAt: now,
      updatedAt: now,
      status: 'uploading'
    };
    this.upsertSession(record);
    this.writeSession(record, upload.userId);
    return record;
  }

  updateSession(id: string, patch: Partial<AudioSessionRecord>): void {
    void this.persistSessionPatch(id, patch).catch(error => {
      console.error('Failed to update audio session in Firestore.', error);
    });
  }

  async persistSessionPatch(id: string, patch: Partial<AudioSessionRecord>): Promise<void> {
    const { updatedAt } = this.applySessionPatch(id, patch) || {};

    if (!updatedAt) {
      return;
    }

    if (!this.db || !this.activeUserId) {
      throw new Error('No active user set for audio sessions.');
    }

    const docRef = doc(this.db, 'users', this.activeUserId, 'audioSessions', id);
    await updateDoc(docRef, { ...patch, updatedAt });
  }

  private setActiveUser(userId: string): void {
    if (!userId || this.activeUserId === userId) {
      return;
    }
    this.activeUserId = userId;
    this.sessionsUnsubscribe?.();
    if (!this.db) {
      console.error('Firebase is not configured. Cannot load sessions.');
      return;
    }
    const sessionsRef = collection(this.db, 'users', userId, 'audioSessions');
    const sessionsQuery = query(sessionsRef, orderBy('createdAt', 'desc'));
    this.sessionsUnsubscribe = onSnapshot(
      sessionsQuery,
      snapshot => {
        const records = snapshot.docs.map(docSnap => {
          const data = docSnap.data() as Omit<AudioSessionRecord, 'id'>;
          return { id: docSnap.id, ...data };
        });
        this.sessions.set(records);
      },
      error => {
        console.error('Failed to load audio sessions from Firestore.', error);
      }
    );
  }

  private clearSessions(): void {
    this.sessionsUnsubscribe?.();
    this.sessions.set([]);
    this.activeUserId = null;
  }

  private upsertSession(record: AudioSessionRecord): void {
    const sessions = this.sessions();
    const index = sessions.findIndex(session => session.id === record.id);
    const next = [...sessions];
    if (index === -1) {
      next.unshift(record);
    } else {
      next[index] = record;
    }
    this.sessions.set(next);
  }

  private applySessionPatch(
    id: string,
    patch: Partial<AudioSessionRecord>
  ): { updatedAt: string } | null {
    const sessions = this.sessions();
    const index = sessions.findIndex(session => session.id === id);
    if (index === -1) {
      return null;
    }
    const updatedAt = new Date().toISOString();
    const updated = {
      ...sessions[index],
      ...patch,
      updatedAt
    };
    const next = [...sessions];
    next[index] = updated;
    this.sessions.set(next);
    return { updatedAt };
  }

  private defaultTitle(fileName: string): string {
    const base = fileName.replace(/\.[^/.]+$/, '');
    return `Session: ${base}`;
  }

  private writeSession(record: AudioSessionRecord, userId: string): void {
    if (!this.db) {
      console.error('Firebase is not configured. Cannot save sessions.');
      return;
    }
    const docRef = doc(this.db, 'users', userId, 'audioSessions', record.id);
    void setDoc(docRef, record, { merge: true }).catch(error => {
      console.error('Failed to save audio session to Firestore.', error);
    });
  }

  private generateId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
