import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { serverTimestamp } from 'firebase/firestore';
import { AuthService } from '../../auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { StoryEditor, StoryEditorRepository, StoryEditorRepositoryFactory } from '../repository/story-editor.repository';
import { toMillis } from '../utils/date.utils';
import * as logger from '../logger';

/** The campaign story of a campaign (only its newest version can be edited). */
export const CAMPAIGN_STORY_TARGET = 'campaign-story';

/** The story of one session. */
export function sessionStoryTarget(sessionId: string): string {
  return `session_${sessionId}`;
}

/** The name other members see for someone: display name, else the part of the e-mail before the @. */
export function editorName(user: { displayName?: string | null; email?: string | null } | null | undefined): string {
  return user?.displayName?.trim() || user?.email?.split('@')[0]?.trim() || '';
}

/** How often the holder of a lock says it is still there. */
export const LOCK_HEARTBEAT_MS = 25_000;
/**
 * A lock not refreshed for this long has expired (closed tab, lost connection)
 * and can be taken over. The same number is in firestore.rules.
 */
export const LOCK_EXPIRES_MS = 90_000;
/** A holder who did nothing on the page for this long gives the lock back; their text stays in the form. */
export const LOCK_IDLE_MS = 10 * 60_000;
/** How often an expired lock is noticed without anything else changing. */
const CLOCK_MS = 15_000;
/** After losing the lock: at most one attempt per this long to get it back while the member keeps working. */
const RETRY_MS = 5_000;

interface Watched {
  campaignId: string;
  target: string;
  repo: StoryEditorRepository;
}

/**
 * The lock on the story on screen: one member edits at a time. Provide it on the
 * page that shows the story: `watch` the story, `acquire` before the edit form
 * opens and before saving, `release` when the form closes, and read `heldBy` for
 * the name of the member who is editing.
 *
 * The Firestore rules enforce it: a lock that someone else holds can only be
 * taken once it has expired. A member who leaves the form open without doing
 * anything gives the lock back after a while (`lost`); it is taken again as soon
 * as they continue, if nobody else has it by then.
 */
@Injectable()
export class StoryEditLockService implements OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly i18n = inject(I18nService);
  private readonly repoFactory = inject(StoryEditorRepositoryFactory);

  private readonly watched = signal<Watched | null>(null);
  private readonly now = signal(Date.now());
  private readonly clock = setInterval(() => this.now.set(Date.now()), CLOCK_MS);
  private heartbeat?: ReturnType<typeof setInterval>;
  /** none: not editing. held: this member has the lock. lost: editing, but the lock is gone. */
  private readonly state = signal<'none' | 'held' | 'lost'>('none');
  private lastActivity = 0;
  private lastRetry = 0;

  private readonly onActivity = () => this.noteActivity();
  private readonly onPageHide = () => this.release();

  /**
   * The member who holds the lock when that is someone else, by the name to
   * show; '' when the story is free or this member holds it.
   */
  readonly heldBy = computed<string>(() => {
    const lock = this.watched()?.repo.get()[0];
    if (!lock || lock.uid === this.authService.currentUser()?.uid || !this.isFresh(lock, this.now())) return '';
    return lock.name || this.i18n.t().storyEdit.someone;
  });

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.onActivity, true);
      window.addEventListener('pointerdown', this.onActivity, true);
      window.addEventListener('pagehide', this.onPageHide);
    }
  }

  /** Follow the lock of a story; null stops following. Gives back the lock on the previous story first. */
  watch(campaignId: string | null | undefined, target: string | null | undefined): void {
    const current = this.watched();
    if (current && current.campaignId === campaignId && current.target === target) return;

    this.release();
    current?.repo.destroy();
    this.watched.set(
      campaignId && target ? { campaignId, target, repo: this.repoFactory.create(campaignId, target) } : null
    );
  }

  /**
   * Take the lock for this member. Resolves to whether they hold it: false when
   * someone else is editing, or when it could not be reached (offline).
   */
  async acquire(): Promise<boolean> {
    if (this.state() === 'held') return true;

    const watched = this.watched();
    const user = this.authService.currentUser();
    if (!watched || !user?.uid) return false;

    try {
      const taken = await watched.repo.setInTransaction(watched.target, current =>
        current && current.uid !== user.uid && this.isFresh(current, Date.now()) ? null : this.lockOf(watched.target, user)
      );
      if (!taken) return false;
    } catch (error) {
      // Refused by the rules (someone else was first, or their lock has not expired
      // by the server's clock) or no connection: either way this member does not have it.
      logger.warn('Could not take the edit lock of the story:', error);
      return false;
    }

    // The story on screen changed while the lock was being taken: it is not this story's lock.
    if (this.watched() !== watched) return false;

    this.state.set('held');
    this.lastActivity = Date.now();
    clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => this.beat(), LOCK_HEARTBEAT_MS);
    return true;
  }

  /** Give the lock back (the edit form closed). */
  release(): void {
    clearInterval(this.heartbeat);
    const held = this.state() === 'held';
    this.state.set('none');
    if (held) {
      this.removeLock();
    }
  }

  ngOnDestroy(): void {
    this.release();
    clearInterval(this.clock);
    this.watched()?.repo.destroy();
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.onActivity, true);
      window.removeEventListener('pointerdown', this.onActivity, true);
      window.removeEventListener('pagehide', this.onPageHide);
    }
  }

  /** Still there: refresh the lock, or give it back when the member has done nothing for a long time. */
  private beat(): void {
    const watched = this.watched();
    const user = this.authService.currentUser();
    if (!watched || !user?.uid || this.state() !== 'held') return;

    if (Date.now() - this.lastActivity > LOCK_IDLE_MS) {
      this.lose();
      this.removeLock();
      return;
    }

    void watched.repo.update(this.lockOf(watched.target, user)).catch((error: unknown) => {
      // Refused: the lock expired (e.g. the computer slept) and someone else took it.
      logger.warn('Could not keep the edit lock of the story:', error);
      if (this.watched() === watched) {
        this.lose();
      }
    });
  }

  private lose(): void {
    if (this.state() !== 'held') return;
    clearInterval(this.heartbeat);
    this.state.set('lost');
  }

  /** The member is at work. After losing the lock: try to get it back, now and then. */
  private noteActivity(): void {
    const now = Date.now();
    this.lastActivity = now;
    if (this.state() === 'lost' && now - this.lastRetry >= RETRY_MS) {
      this.lastRetry = now;
      void this.acquire();
    }
  }

  private removeLock(): void {
    const watched = this.watched();
    if (!watched) return;
    void watched.repo
      .delete(watched.target)
      .catch((error: unknown) => logger.warn('Could not give back the edit lock of the story:', error));
  }

  private isFresh(lock: Pick<StoryEditor, 'updatedAt'>, now: number): boolean {
    // A lock this member's own write is still on its way for has no server time yet: it is fresh.
    const updatedAt = toMillis(lock.updatedAt);
    return updatedAt === 0 || now - updatedAt < LOCK_EXPIRES_MS;
  }

  private lockOf(target: string, user: { uid: string; displayName?: string | null; email?: string | null }): StoryEditor & Record<string, unknown> {
    return {
      id: target,
      target,
      uid: user.uid,
      name: editorName(user).slice(0, 100),
      updatedAt: serverTimestamp(),
    };
  }
}
