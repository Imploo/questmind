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
  private pendingSave: { sessionId: string; corrections: string } | null = null;

  /**
   * Sync corrections state when the active session changes.
   * Call this from an effect in the parent component.
   *
   * The textarea is the source of truth while the user types: the field is
   * only (re)filled from the database when the active session changes, never
   * when a Firestore snapshot echoes back a value for the same session.
   */
  syncToSession(session: AudioSessionRecord | null): void {
    const sessionId = session?.id ?? null;
    if (sessionId === this.activeSessionId) {
      return;
    }
    this.flushPendingSave();
    this.activeSessionId = sessionId;
    this.corrections.set(session?.userCorrections ?? '');
    this.saveStatus.set('idle');
    this.clearStatusTimer();
  }

  onInput(corrections: string): void {
    this.corrections.set(corrections);
    this.saveStatus.set('saving');
    this.clearSaveTimer();
    this.pendingSave = this.activeSessionId
      ? { sessionId: this.activeSessionId, corrections }
      : null;
    this.saveTimer = setTimeout(() => {
      this.flushPendingSave();
    }, 500);
  }

  ngOnDestroy(): void {
    this.flushPendingSave();
    this.clearStatusTimer();
  }

  private flushPendingSave(): void {
    this.clearSaveTimer();
    const pending = this.pendingSave;
    this.pendingSave = null;
    if (!pending) {
      return;
    }
    void this.save(pending.sessionId, pending.corrections);
  }

  private async save(sessionId: string, corrections: string): Promise<void> {
    try {
      await this.sessionStateService.persistSessionPatch(sessionId, {
        userCorrections: corrections,
        correctionsUpdatedAt: new Date().toISOString()
      });
      // Only show save feedback if the saved session is still the active one
      if (sessionId !== this.activeSessionId) {
        return;
      }
      this.saveStatus.set('saved');
      this.clearStatusTimer();
      this.statusTimer = setTimeout(() => {
        this.saveStatus.set('idle');
      }, 2000);
    } catch (error) {
      logger.error('Failed to save corrections:', error);
      if (sessionId === this.activeSessionId) {
        this.saveStatus.set('idle');
      }
    }
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
