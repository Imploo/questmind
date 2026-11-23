import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import {
  CAMPAIGN_STORY_TARGET,
  StoryPresenceService,
  editorName,
  sessionStoryTarget,
} from './story-presence.service';
import { AuthService } from '../../auth/auth.service';
import { StoryEditor, StoryEditorRepositoryFactory } from '../repository/story-editor.repository';

describe('editorName', () => {
  it('prefers the display name, then the part of the e-mail before the @', () => {
    expect(editorName({ displayName: ' Mira ', email: 'mira@example.com' })).toBe('Mira');
    expect(editorName({ displayName: null, email: 'kael@example.com' })).toBe('kael');
    expect(editorName({ displayName: '', email: null })).toBe('');
    expect(editorName(null)).toBe('');
  });
});

describe('StoryPresenceService', () => {
  const NOW = new Date('2026-11-23T10:00:00Z').getTime();
  const secondsAgo = (seconds: number) => ({ toDate: () => new Date(NOW - seconds * 1000) });

  /** One fake repository per watched story, with the editors Firestore would deliver. */
  const repos = new Map<string, ReturnType<typeof fakeRepo>>();
  function fakeRepo() {
    const editors = signal<StoryEditor[]>([]);
    return {
      editors,
      get: editors,
      update: vi.fn(() => Promise.resolve()),
      delete: vi.fn(() => Promise.resolve()),
      destroy: vi.fn(),
    };
  }
  const repoFor = (campaignId: string, target: string) => repos.get(`${campaignId}/${target}`)!;
  const editor = (uid: string, name: string, secondsOld = 5, target = CAMPAIGN_STORY_TARGET): StoryEditor => ({
    id: `${target}_${uid}`, target, uid, name, updatedAt: secondsAgo(secondsOld),
  });

  let service: StoryPresenceService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    repos.clear();
    TestBed.configureTestingModule({
      providers: [
        StoryPresenceService,
        { provide: AuthService, useValue: { currentUser: signal({ uid: 'me', displayName: 'Thalia', email: 'thalia@example.com' }) } },
        {
          provide: StoryEditorRepositoryFactory,
          useValue: {
            create: (campaignId: string, target: string) => {
              const repo = fakeRepo();
              repos.set(`${campaignId}/${target}`, repo);
              return repo;
            },
          },
        },
      ],
    });
    service = TestBed.inject(StoryPresenceService);
  });

  afterEach(() => {
    service.ngOnDestroy();
    vi.useRealTimers();
  });

  it('names the other members editing the story, not this member, in alphabetical order', () => {
    service.watch('c1', CAMPAIGN_STORY_TARGET);
    repoFor('c1', CAMPAIGN_STORY_TARGET).editors.set([editor('b', 'Mira'), editor('me', 'Thalia'), editor('a', 'Kael')]);

    expect(service.others()).toEqual(['Kael', 'Mira']);
  });

  it('drops an editor who has not been heard from (a closed tab), also while nothing else changes', () => {
    service.watch('c1', CAMPAIGN_STORY_TARGET);
    repoFor('c1', CAMPAIGN_STORY_TARGET).editors.set([editor('a', 'Kael', 5), editor('b', 'Mira', 80)]);
    expect(service.others()).toEqual(['Kael', 'Mira']);

    vi.advanceTimersByTime(30_000);

    expect(service.others()).toEqual(['Kael']);
  });

  it('says that this member is editing, keeps saying so, and clears it when the form closes', () => {
    service.watch('c1', sessionStoryTarget('s1'));
    const repo = repoFor('c1', 'session_s1');

    service.setEditing(true);
    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'session_s1_me', target: 'session_s1', uid: 'me', name: 'Thalia' })
    );

    vi.advanceTimersByTime(60_000);
    expect(repo.update).toHaveBeenCalledTimes(3);

    service.setEditing(false);
    expect(repo.delete).toHaveBeenCalledWith('session_s1_me');
    vi.advanceTimersByTime(60_000);
    expect(repo.update).toHaveBeenCalledTimes(3);
  });

  it('leaves the story it was editing when another story comes on screen', () => {
    service.watch('c1', sessionStoryTarget('s1'));
    const first = repoFor('c1', 'session_s1');
    service.setEditing(true);

    service.watch('c1', sessionStoryTarget('s2'));

    expect(first.delete).toHaveBeenCalledWith('session_s1_me');
    expect(first.destroy).toHaveBeenCalled();
    expect(repoFor('c1', 'session_s2').update).not.toHaveBeenCalled();
    expect(service.others()).toEqual([]);
  });

  it('does not start over for the story it is already watching', () => {
    service.watch('c1', CAMPAIGN_STORY_TARGET);
    const repo = repoFor('c1', CAMPAIGN_STORY_TARGET);
    service.setEditing(true);

    service.watch('c1', CAMPAIGN_STORY_TARGET);

    expect(repo.delete).not.toHaveBeenCalled();
    expect(repoFor('c1', CAMPAIGN_STORY_TARGET)).toBe(repo);
  });

  it('clears its mark when the page goes away', () => {
    service.watch('c1', CAMPAIGN_STORY_TARGET);
    const repo = repoFor('c1', CAMPAIGN_STORY_TARGET);
    service.setEditing(true);

    service.ngOnDestroy();

    expect(repo.delete).toHaveBeenCalledWith('campaign-story_me');
    expect(repo.destroy).toHaveBeenCalled();
  });

  it('keeps working when sharing the mark fails: it is a courtesy', async () => {
    service.watch('c1', CAMPAIGN_STORY_TARGET);
    const repo = repoFor('c1', CAMPAIGN_STORY_TARGET);
    repo.update.mockRejectedValueOnce(new Error('offline'));

    expect(() => service.setEditing(true)).not.toThrow();
    await Promise.resolve();
    expect(service.others()).toEqual([]);
  });

  it('has nobody to name when no story is watched', () => {
    service.watch(null, null);
    service.setEditing(true);

    expect(service.others()).toEqual([]);
  });
});
