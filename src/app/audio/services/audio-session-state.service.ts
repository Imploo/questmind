import { Injectable, signal, effect, inject, Injector, runInInjectionContext, Signal } from '@angular/core';
import {
  doc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

import { AuthService } from '../../auth/auth.service';
import { CampaignContextService } from '../../campaign/campaign-context.service';
import { FirebaseService } from '../../core/firebase.service';
import {
  AudioSessionRecord,
  AudioUpload
} from './audio-session.models';
import { AudioSessionRepository, AudioSessionRepositoryFactory } from '../../shared/repository/audio-session.repository';

@Injectable({
  providedIn: 'root'
})
export class AudioSessionStateService {
  readonly sessions: Signal<(AudioSessionRecord & Record<string, unknown>)[]>;
  private readonly _sessions = signal<(AudioSessionRecord & Record<string, unknown>)[]>([]);
  private readonly firebase = inject(FirebaseService);
  private activeUserId: string | null = null;
  private activeCampaignId: string | null = null;
  private sessionRepo: AudioSessionRepository | null = null;

  private readonly authService = inject(AuthService);
  private readonly campaignContext = inject(CampaignContextService);
  private readonly sessionRepoFactory = inject(AudioSessionRepositoryFactory);
  private readonly injector = inject(Injector);

  constructor() {
    this.sessions = this._sessions.asReadonly();

    effect(() => {
      const user = this.authService.currentUser();
      const campaignId = this.campaignContext.selectedCampaignId();
      if (user?.uid && campaignId) {
        this.setActiveContext(user.uid, campaignId);
      } else {
        this.clearSessions();
      }
    });
  }

  getSession(id: string): AudioSessionRecord | undefined {
    return this._sessions().find(session => session.id === id) as AudioSessionRecord | undefined;
  }

  createSessionDraft(upload: AudioUpload): AudioSessionRecord {
    this.setActiveContext(upload.userId, upload.campaignId);
    const now = new Date().toISOString();
    const id = this.generateId();
    const title = upload.sessionName?.trim() || this.defaultTitle(upload.file.name);
    const record: AudioSessionRecord = {
      id,
      campaignId: upload.campaignId,
      ownerId: upload.userId,
      ownerEmail: this.authService.currentUser()?.email || '',
      createdBy: upload.userId,
      title,
      content: '',
      sessionDate: upload.sessionDate,
      audioFileName: upload.file.name,
      createdAt: now,
      updatedAt: now,
      status: 'uploading'
    };
    this.upsertSession(record);
    this.writeSession(record, upload.campaignId);
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

    const db = this.firebase.firestore;
    if (!db || !this.activeCampaignId) {
      throw new Error('No active campaign set for audio sessions.');
    }

    const docRef = doc(db, 'campaigns', this.activeCampaignId, 'audioSessions', id);
    await updateDoc(docRef, { ...patch, updatedAt });
  }

  private setActiveContext(userId: string, campaignId: string): void {
    if (!userId || !campaignId) {
      return;
    }
    if (this.activeUserId === userId && this.activeCampaignId === campaignId) {
      return;
    }
    this.activeUserId = userId;
    this.activeCampaignId = campaignId;

    // Cleanup old repo
    this.sessionRepo?.destroy();

    const db = this.firebase.firestore;
    if (!db) {
      console.error('Firebase is not configured. Cannot load sessions.');
      return;
    }

    // Create new repo for this campaign
    runInInjectionContext(this.injector, () => {
      this.sessionRepo = this.sessionRepoFactory.create(campaignId);

      // Sync repo data to service signal
      const repoSignal = this.sessionRepo.get;
      effect(() => {
        this._sessions.set(repoSignal());
      });
    });
  }

  private clearSessions(): void {
    this.sessionRepo?.destroy();
    this.sessionRepo = null;
    this._sessions.set([]);
    this.activeUserId = null;
    this.activeCampaignId = null;
  }

  private upsertSession(record: AudioSessionRecord): void {
    const sessions = this._sessions();
    const index = sessions.findIndex(session => session.id === record.id);
    const next = [...sessions];
    if (index === -1) {
      next.unshift(record as AudioSessionRecord & Record<string, unknown>);
    } else {
      next[index] = record as AudioSessionRecord & Record<string, unknown>;
    }
    this._sessions.set(next);
  }

  private applySessionPatch(
    id: string,
    patch: Partial<AudioSessionRecord>
  ): { updatedAt: string } | null {
    const sessions = this._sessions();
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
    this._sessions.set(next);
    return { updatedAt };
  }

  private defaultTitle(fileName: string): string {
    const base = fileName.replace(/\.[^/.]+$/, '');
    return `Session: ${base}`;
  }

  private writeSession(record: AudioSessionRecord, campaignId: string): void {
    const db = this.firebase.firestore;
    if (!db) {
      console.error('Firebase is not configured. Cannot save sessions.');
      return;
    }
    const docRef = doc(db, 'campaigns', campaignId, 'audioSessions', record.id);
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
