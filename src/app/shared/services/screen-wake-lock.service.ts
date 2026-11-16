import { Injectable } from '@angular/core';
import * as logger from '../logger';

/**
 * Keeps the screen from dimming and locking for as long as someone holds on to it.
 *
 * The browser takes its wake lock back whenever the page goes out of sight (another tab,
 * another app, a locked phone), so the lock is asked for again each time the page comes
 * back. Several parts of the app can hold at once; the screen is let go with the last one.
 */
@Injectable({ providedIn: 'root' })
export class ScreenWakeLockService {
  /** False on a browser without the Screen Wake Lock API: holding then does nothing. */
  readonly supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  private holders = 0;
  private sentinel: WakeLockSentinel | null = null;
  private syncing = false;
  private readonly onVisibilityChange = () => void this.sync();

  /** Keeps the screen awake until the returned function is called. */
  hold(): () => void {
    if (!this.supported) {
      return () => undefined;
    }
    this.holders++;
    if (this.holders === 1) {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
    void this.sync();

    let held = true;
    return () => {
      if (!held) return;
      held = false;
      this.holders--;
      if (this.holders === 0) {
        document.removeEventListener('visibilitychange', this.onVisibilityChange);
      }
      void this.sync();
    };
  }

  /**
   * Brings the lock in line with what is wanted. Asking and letting go both take a
   * moment, so this keeps going until the two agree: a hold that is given back while the
   * lock is still being asked for lets it go again as soon as it arrives.
   */
  private async sync(): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;
    try {
      for (;;) {
        const wanted = this.holders > 0 && document.visibilityState === 'visible';
        if (wanted && !this.sentinel) {
          const sentinel = await navigator.wakeLock.request('screen');
          sentinel.addEventListener('release', () => {
            if (this.sentinel === sentinel) this.sentinel = null;
          });
          this.sentinel = sentinel;
        } else if (!wanted && this.sentinel) {
          const sentinel = this.sentinel;
          this.sentinel = null;
          await sentinel.release();
        } else {
          return;
        }
      }
    } catch (error: unknown) {
      // Refused, for instance by a battery saver. The next return to the page tries again.
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('Screen wake lock failed: ' + message);
    } finally {
      this.syncing = false;
    }
  }
}
