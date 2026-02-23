import { Injectable, computed, effect, inject, resource } from '@angular/core';

import { AuthService } from '../../auth/auth.service';
import { CampaignContextService } from '../../campaign/campaign-context.service';
import {
  AudioSessionRecord,
  AudioUpload
} from './audio-session.models';
import { AudioSessionRepositoryFactory } from '../../shared/repository/audio-session.repository';
import * as logger from '../../shared/logger';

type SessionRecord = AudioSessionRecord & Record<string, unknown>;

@Injectable({
  providedIn: 'root'
})
export class AudioSessionStateService {
  private readonly authService = inject(AuthService);
  private readonly campaignContext = inject(CampaignContextService);
  private readonly sessionRepoFactory = inject(AudioSessionRepositoryFactory);

  private readonly sessionRepo = resource({
    params: () => {
      const user = this.authService.currentUser();
      const campaignId = this.campaignContext.selectedCampaignId();
      if (!user?.uid || !campaignId) return undefined;
      return { userId: user.uid, campaignId };
    },
    loader: async ({ params }) => {
      const repo = this.sessionRepoFactory.create(params.campaignId);
      await repo.waitForData();
      return repo;
    },
  });

  readonly sessions = computed<SessionRecord[]>(() => {
    const repo = this.sessionRepo.value();
    return repo ? repo.get() : [];
  });

  readonly sortedSessions = computed<SessionRecord[]>(() => {
    const sessions = this.sessions();
    return [...sessions].sort((a, b) => {
      const dateA = a.sessionDate || '';
      const dateB = b.sessionDate || '';
      return dateB.localeCompare(dateA);
    });
  });

  constructor() {
    effect((onCleanup) => {
      const repo = this.sessionRepo.value();
      if (repo) {
        onCleanup(() => repo.destroy());
      }
    });
  }

  getSession(id: string): AudioSessionRecord | undefined {
    return this.sessions().find(session => session.id === id) as AudioSessionRecord | undefined;
  }

  createSessionDraft(upload: AudioUpload): AudioSessionRecord {
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
    this.writeSession(record);
    return record;
  }

  updateSession(id: string, patch: Partial<AudioSessionRecord>): void {
    void this.persistSessionPatch(id, patch).catch(error => {
      logger.error('Failed to update audio session in Firestore.', error);
    });
  }

  async deleteSession(id: string): Promise<void> {
    const repo = this.sessionRepo.value();
    if (!repo) {
      throw new Error('No active campaign set for audio sessions.');
    }
    await repo.delete(id as SessionRecord['id']);
  }

  async persistSessionPatch(id: string, patch: Partial<AudioSessionRecord>): Promise<void> {
    const exists = this.sessions().some(session => session.id === id);
    if (!exists) {
      return;
    }

    const repo = this.sessionRepo.value();
    if (!repo) {
      throw new Error('No active campaign set for audio sessions.');
    }

    const updatedAt = new Date().toISOString();
    await repo.patch(id as SessionRecord['id'], { ...patch, updatedAt });
  }

  private defaultTitle(fileName: string): string {
    const base = fileName.replace(/\.[^/.]+$/, '');
    return `Session: ${base}`;
  }

  private writeSession(record: AudioSessionRecord): void {
    const repo = this.sessionRepo.value();
    if (!repo) {
      logger.error('Repository not available. Cannot save sessions.');
      return;
    }
    void repo.update(record as SessionRecord).catch(error => {
      logger.error('Failed to save audio session to Firestore.', error);
    });
  }

  private generateId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
