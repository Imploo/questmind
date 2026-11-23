import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { serverTimestamp } from 'firebase/firestore';
import { AuthService } from '../../auth/auth.service';
import { StoryEditorRepository, StoryEditorRepositoryFactory } from '../repository/story-editor.repository';
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

/** How often an open edit form says it is still there. */
const HEARTBEAT_MS = 25_000;
/** An editor not heard from for this long has left (closed tab, lost connection). */
const STALE_MS = 90_000;
/** How often stale editors are weeded out of the list. */
const CLOCK_MS = 15_000;

interface Watched {
  campaignId: string;
  target: string;
  repo: StoryEditorRepository;
}

/**
 * Who else is editing the story on screen. Provide it on the page that shows the
 * story: `watch` the story, call `setEditing` when the member opens or closes the
 * edit form, and read `others` for the names to show.
 *
 * It is a courtesy, not a lock: saving is guarded separately (a save is refused
 * when the story changed in the meantime). A failed presence write is only logged.
 */
@Injectable()
export class StoryPresenceService implements OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly repoFactory = inject(StoryEditorRepositoryFactory);

  private readonly watched = signal<Watched | null>(null);
  private readonly now = signal(Date.now());
  private readonly clock = setInterval(() => this.now.set(Date.now()), CLOCK_MS);
  private heartbeat?: ReturnType<typeof setInterval>;
  private editing = false;
  private readonly onPageHide = () => this.leave();

  /** Names of the other members editing the watched story right now, in alphabetical order. */
  readonly others = computed<string[]>(() => {
    const watched = this.watched();
    if (!watched) return [];
    const uid = this.authService.currentUser()?.uid;
    const freshFrom = this.now() - STALE_MS;
    const names = watched.repo.get()
      .filter(editor => editor.uid !== uid && toMillis(editor.updatedAt) >= freshFrom)
      .map(editor => editor.name)
      .filter(name => !!name);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  });

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.onPageHide);
    }
  }

  /** Follow the editors of a story; null stops following. Leaves the previous story first. */
  watch(campaignId: string | null | undefined, target: string | null | undefined): void {
    const current = this.watched();
    if (current && current.campaignId === campaignId && current.target === target) return;

    this.setEditing(false);
    current?.repo.destroy();
    this.watched.set(
      campaignId && target ? { campaignId, target, repo: this.repoFactory.create(campaignId, target) } : null
    );
  }

  /** Tell the others that this member has the edit form open, or has closed it. */
  setEditing(editing: boolean): void {
    if (editing === this.editing) return;
    this.editing = editing;
    clearInterval(this.heartbeat);

    if (editing) {
      this.announce();
      this.heartbeat = setInterval(() => this.announce(), HEARTBEAT_MS);
    } else {
      this.leave();
    }
  }

  ngOnDestroy(): void {
    this.setEditing(false);
    clearInterval(this.clock);
    this.watched()?.repo.destroy();
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.onPageHide);
    }
  }

  private announce(): void {
    const watched = this.watched();
    const user = this.authService.currentUser();
    if (!watched || !user?.uid) return;

    void watched.repo
      .update({
        id: this.documentId(watched.target, user.uid),
        target: watched.target,
        uid: user.uid,
        name: editorName(user).slice(0, 100),
        updatedAt: serverTimestamp(),
      })
      .catch((error: unknown) => logger.warn('Could not share that the story is being edited:', error));
  }

  private leave(): void {
    const watched = this.watched();
    const uid = this.authService.currentUser()?.uid;
    if (!watched || !uid) return;

    void watched.repo
      .delete(this.documentId(watched.target, uid))
      .catch((error: unknown) => logger.warn('Could not clear the editing mark of the story:', error));
  }

  private documentId(target: string, uid: string): string {
    return `${target}_${uid}`;
  }
}
