import { Injectable, OnDestroy, signal, inject } from '@angular/core';
import { AudioSessionStateService } from './audio-session-state.service';
import { AudioSessionRecord } from './audio-session.models';
import * as logger from '../../shared/logger';

@Injectable()
export class CorrectionsSaveService implements OnDestroy {
  private readonly sessionStateService = inject(AudioSessionStateService);

  readonly corrections = signal('');
  readonly saveStatus = signal<'idle' | 'saving' | 'saved'>('idle');

  private saveTimer?: ReturnType<typeof setTimeout>;
  private statusTimer?: ReturnType<typeof setTimeout>;
  private activeSessionId: string | null = null;

  /**
   * Sync corrections state when the active session changes.
   * Call this from an effect in the parent component.
   */
  syncToSession(session: AudioSessionRecord | null): void {
    const sessionId = session?.id ?? null;
    if (sessionId !== this.activeSessionId) {
      this.activeSessionId = sessionId;
      this.corrections.set(session?.userCorrections ?? '');
      this.saveStatus.set('idle');
      this.clearTimers();
      return;
    }
    // If same session and user isn't actively saving, sync from Firestore
    if (this.saveStatus() === 'idle') {
      const corrections = session?.userCorrections ?? '';
      if (corrections !== this.corrections()) {
        this.corrections.set(corrections);
      }
    }
  }

  onInput(corrections: string): void {
    this.corrections.set(corrections);
    this.saveStatus.set('saving');
    this.clearSaveTimer();
    this.saveTimer = setTimeout(() => {
      void this.save(corrections);
    }, 500);
  }

  ngOnDestroy(): void {
    this.clearTimers();
  }

  private async save(corrections: string): Promise<void> {
    const sessionId = this.activeSessionId;
    if (!sessionId) {
      this.saveStatus.set('idle');
      return;
    }
    try {
      await this.sessionStateService.persistSessionPatch(sessionId, {
        userCorrections: corrections,
        correctionsUpdatedAt: new Date().toISOString()
      });
      this.saveStatus.set('saved');
      this.clearStatusTimer();
      this.statusTimer = setTimeout(() => {
        this.saveStatus.set('idle');
      }, 2000);
    } catch (error) {
      logger.error('Failed to save corrections:', error);
      this.saveStatus.set('idle');
    }
  }

  private clearTimers(): void {
    this.clearSaveTimer();
    this.clearStatusTimer();
  }

  private clearSaveTimer(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
  }

  private clearStatusTimer(): void {
    if (this.statusTimer) {
      clearTimeout(this.statusTimer);
    }
  }
}
