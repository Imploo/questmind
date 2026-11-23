import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import {
  CAMPAIGN_STORY_TARGET,
  LOCK_EXPIRES_MS,
  LOCK_HEARTBEAT_MS,
  LOCK_IDLE_MS,
  StoryEditLockService,
  editorName,
  sessionStoryTarget,
} from './story-edit-lock.service';
import { AuthService } from '../../auth/auth.service';
import { StoryEditor, StoryEditorRepositoryFactory } from '../repository/story-editor.repository';
import { provideTestLanguage } from '../../core/i18n/testing';
import { en } from '../../core/i18n/en';

describe('editorName', () => {
  it('prefers the display name, then the part of the e-mail before the @', () => {
    expect(editorName({ displayName: ' Mira ', email: 'mira@example.com' })).toBe('Mira');
    expect(editorName({ displayName: null, email: 'kael@example.com' })).toBe('kael');
    expect(editorName({ displayName: '', email: null })).toBe('');
    expect(editorName(null)).toBe('');
  });
});

describe('StoryEditLockService', () => {
  const NOW = new Date('2026-11-23T10:00:00Z').getTime();
  const at = (millis: number) => ({ toDate: () => new Date(millis) });

  /**
   * One fake repository per watched story. `stored` is the lock document as the
   * database has it; the fake applies the same rule as firestore.rules: a lock of
   * someone else can only be overwritten once it has expired.
   */
  type StoredLock = StoryEditor & { updatedAt: { toDate: () => Date } };
  function fakeRepo() {
    const stored = signal<StoredLock[]>([]);
    const mayWrite = (uid: string) => {
      const current = stored()[0];
      return !current || current.uid === uid || Date.now() - current.updatedAt.toDate().getTime() >= LOCK_EXPIRES_MS;
    };
    const write = (lock: StoryEditor) => {
      if (!mayWrite(lock.uid)) throw new Error('permission-denied');
      stored.set([{ ...lock, updatedAt: at(Date.now()) }]);
    };
    return {
      stored,
      get: stored,
      setInTransaction: vi.fn(async (_key: string, decide: (current: StoryEditor | null) => StoryEditor | null) => {
        const lock = decide(stored()[0] ?? null);
        if (!lock) return false;
        write(lock);
        return true;
      }),
      update: vi.fn(async (lock: StoryEditor) => write(lock)),
      delete: vi.fn(async () => stored.set([])),
      destroy: vi.fn(),
    };
  }
  const repos = new Map<string, ReturnType<typeof fakeRepo>>();
  const repoFor = (target: string) => repos.get(target)!;
  const lockOf = (uid: string, name: string, target = CAMPAIGN_STORY_TARGET, secondsOld = 5) =>
    ({ id: target, target, uid, name, updatedAt: at(Date.now() - secondsOld * 1000) }) as StoredLock;

  let service: StoryEditLockService;
  /** Let the promises of a fire-and-forget write settle. */
  const settle = () => vi.advanceTimersByTimeAsync(0);
  const keystroke = () => window.dispatchEvent(new Event('keydown'));

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    repos.clear();
    TestBed.configureTestingModule({
      providers: [
        StoryEditLockService,
        provideTestLanguage('en'),
        { provide: AuthService, useValue: { currentUser: signal({ uid: 'me', displayName: 'Thalia', email: 'thalia@example.com' }) } },
        {
          provide: StoryEditorRepositoryFactory,
          useValue: {
            create: (_campaignId: string, target: string) => {
              const repo = fakeRepo();
              repos.set(target, repo);
              return repo;
            },
          },
        },
      ],
    });
    service = TestBed.inject(StoryEditLockService);
    service.watch('c1', CAMPAIGN_STORY_TARGET);
  });

  afterEach(() => {
    service.ngOnDestroy();
    vi.useRealTimers();
  });

  describe('taking the lock', () => {
    it('takes a free story for this member, by their name', async () => {
      await expect(service.acquire()).resolves.toBe(true);

      expect(repoFor(CAMPAIGN_STORY_TARGET).stored()[0]).toEqual(
        expect.objectContaining({ id: 'campaign-story', target: 'campaign-story', uid: 'me', name: 'Thalia' })
      );
      expect(service.heldBy()).toBe('');
    });

    it('refuses while someone else is editing, and names them', async () => {
      repoFor(CAMPAIGN_STORY_TARGET).stored.set([lockOf('other', 'Mira')]);

      await expect(service.acquire()).resolves.toBe(false);

      expect(service.heldBy()).toBe('Mira');
      expect(repoFor(CAMPAIGN_STORY_TARGET).stored()[0].uid).toBe('other');
    });

    it('takes over a lock that expired: its holder closed the tab or lost the connection', async () => {
      repoFor(CAMPAIGN_STORY_TARGET).stored.set([lockOf('other', 'Mira', CAMPAIGN_STORY_TARGET, 120)]);
      expect(service.heldBy()).toBe('');

      await expect(service.acquire()).resolves.toBe(true);

      expect(repoFor(CAMPAIGN_STORY_TARGET).stored()[0].uid).toBe('me');
    });

    it('does not have the lock when the database refuses it (someone else was first)', async () => {
      repoFor(CAMPAIGN_STORY_TARGET).setInTransaction.mockRejectedValueOnce(new Error('permission-denied'));

      await expect(service.acquire()).resolves.toBe(false);
    });

    it('does not ask again while it holds the lock', async () => {
      await service.acquire();
      await service.acquire();

      expect(repoFor(CAMPAIGN_STORY_TARGET).setInTransaction).toHaveBeenCalledTimes(1);
    });

    it('has nothing to take when no story is watched', async () => {
      service.watch(null, null);

      await expect(service.acquire()).resolves.toBe(false);
    });
  });

  describe('who is editing', () => {
    it('stops naming a holder whose lock expires, also while nothing else changes', () => {
      repoFor(CAMPAIGN_STORY_TARGET).stored.set([lockOf('other', 'Mira', CAMPAIGN_STORY_TARGET, 70)]);
      expect(service.heldBy()).toBe('Mira');

      vi.advanceTimersByTime(30_000);

      expect(service.heldBy()).toBe('');
    });

    it('says "someone else" for a holder without a name', () => {
      repoFor(CAMPAIGN_STORY_TARGET).stored.set([lockOf('other', '')]);

      expect(service.heldBy()).toBe(en.storyEdit.someone);
    });
  });

  describe('keeping and giving back the lock', () => {
    it('keeps the lock fresh while the member works, so nobody else can take it', async () => {
      await service.acquire();
      const repo = repoFor(CAMPAIGN_STORY_TARGET);

      for (let elapsed = 0; elapsed < 5 * 60_000; elapsed += LOCK_HEARTBEAT_MS) {
        keystroke();
        await vi.advanceTimersByTimeAsync(LOCK_HEARTBEAT_MS);
      }

      expect(Date.now() - repo.stored()[0].updatedAt.toDate().getTime()).toBeLessThan(LOCK_EXPIRES_MS);
      expect(repo.stored()[0].uid).toBe('me');
    });

    it('gives the lock back when the form closes', async () => {
      await service.acquire();
      const repo = repoFor(CAMPAIGN_STORY_TARGET);

      service.release();
      await settle();

      expect(repo.stored()).toEqual([]);
      await vi.advanceTimersByTimeAsync(2 * LOCK_HEARTBEAT_MS);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('gives the lock back when another story comes on screen', async () => {
      await service.acquire();
      const first = repoFor(CAMPAIGN_STORY_TARGET);

      service.watch('c1', sessionStoryTarget('s1'));
      await settle();

      expect(first.stored()).toEqual([]);
      expect(first.destroy).toHaveBeenCalled();
      expect(repoFor('session_s1').stored()).toEqual([]);
    });

    it('gives the lock back when the page goes away', async () => {
      await service.acquire();
      const repo = repoFor(CAMPAIGN_STORY_TARGET);

      service.ngOnDestroy();
      await settle();

      expect(repo.stored()).toEqual([]);
    });

    it('does not remove a lock that is not its own', async () => {
      repoFor(CAMPAIGN_STORY_TARGET).stored.set([lockOf('other', 'Mira')]);
      await service.acquire();

      service.release();

      expect(repoFor(CAMPAIGN_STORY_TARGET).delete).not.toHaveBeenCalled();
    });
  });

  describe('a member who leaves the form open', () => {
    it('gives the lock back after a long time without doing anything, so the story is not blocked', async () => {
      await service.acquire();
      const repo = repoFor(CAMPAIGN_STORY_TARGET);

      await vi.advanceTimersByTimeAsync(LOCK_IDLE_MS + 2 * LOCK_HEARTBEAT_MS);

      expect(repo.stored()).toEqual([]);
    });

    it('takes the lock again as soon as they continue, when nobody else has it', async () => {
      await service.acquire();
      const repo = repoFor(CAMPAIGN_STORY_TARGET);
      await vi.advanceTimersByTimeAsync(LOCK_IDLE_MS + 2 * LOCK_HEARTBEAT_MS);

      keystroke();
      await settle();

      expect(repo.stored()[0]?.uid).toBe('me');
      await expect(service.acquire()).resolves.toBe(true);
    });

    it('does not get it back while someone else has taken it, and names them', async () => {
      await service.acquire();
      const repo = repoFor(CAMPAIGN_STORY_TARGET);
      await vi.advanceTimersByTimeAsync(LOCK_IDLE_MS + 2 * LOCK_HEARTBEAT_MS);
      repo.stored.set([lockOf('other', 'Mira')]);

      keystroke();
      await settle();

      expect(repo.stored()[0].uid).toBe('other');
      expect(service.heldBy()).toBe('Mira');
      await expect(service.acquire()).resolves.toBe(false);
    });
  });

  it('notices that the lock was taken over while the computer slept, and stops refreshing it', async () => {
    await service.acquire();
    const repo = repoFor(CAMPAIGN_STORY_TARGET);
    // The lock expired without a heartbeat and Mira took it.
    repo.stored.set([lockOf('other', 'Mira')]);

    keystroke();
    await vi.advanceTimersByTimeAsync(LOCK_HEARTBEAT_MS);
    expect(service.heldBy()).toBe('Mira');
    const refreshes = repo.update.mock.calls.length;
    await vi.advanceTimersByTimeAsync(3 * LOCK_HEARTBEAT_MS);

    expect(repo.stored()[0].uid).toBe('other');
    expect(repo.update.mock.calls.length).toBe(refreshes);
    // Closing the form now must not remove Mira's lock.
    service.release();
    expect(repo.delete).not.toHaveBeenCalled();
  });
});
