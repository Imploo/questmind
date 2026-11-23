import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AudioSessionStateService } from './audio-session-state.service';
import { AuthService } from '../../auth/auth.service';
import { CampaignContextService } from '../../campaign/campaign-context.service';
import { AudioSessionRepositoryFactory } from '../../shared/repository/audio-session.repository';
import { en } from '../../core/i18n/en';
import { nl } from '../../core/i18n/nl';
import { provideTestLanguage } from '../../core/i18n/testing';

describe('AudioSessionStateService', () => {
  const update = vi.fn();
  /** The session as it is stored at the moment of the transaction. */
  let stored: Record<string, unknown> | null = null;
  const written = vi.fn();
  /** Stands in for the Firestore transaction: reads `stored`, writes the patch the service decides on. */
  const patchInTransaction = vi.fn(
    async (_id: string, decide: (current: Record<string, unknown> | null) => Record<string, unknown> | null) => {
      const patch = decide(stored);
      if (!patch) return false;
      written(patch);
      return true;
    }
  );
  const repo = { waitForData: () => Promise.resolve(), get: () => [], update, patchInTransaction, destroy: vi.fn() };

  async function setup(language: 'nl' | 'en'): Promise<AudioSessionStateService> {
    TestBed.configureTestingModule({
      providers: [
        provideTestLanguage(language),
        { provide: AuthService, useValue: { currentUser: signal({ uid: 'u1', email: 'owner@example.com' }) } },
        { provide: CampaignContextService, useValue: { selectedCampaignId: signal('c1') } },
        { provide: AudioSessionRepositoryFactory, useValue: { create: () => repo } },
      ],
    });
    const service = TestBed.inject(AudioSessionStateService);
    // The repository arrives through a resource: wait until it is there.
    service.sessions();
    await TestBed.inject(ApplicationRef).whenStable();
    return service;
  }

  const upload = (sessionName?: string) => ({
    file: new File(['x'], 'evening-1.wav'),
    sessionName,
    sessionDate: '2026-10-27',
    userId: 'u1',
    campaignId: 'c1',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    update.mockResolvedValue(undefined);
  });

  it.each([
    ['en', en.audio.defaultSessionTitle('evening-1')],
    ['nl', nl.audio.defaultSessionTitle('evening-1')],
  ] as const)('stores a session without a name under a default title in the active language (%s)', async (language, title) => {
    const service = await setup(language);

    const draft = service.createSessionDraft(upload());

    expect(draft.title).toBe(title);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ title, audioFileName: 'evening-1.wav' }));
  });

  describe('saveStoryEdit', () => {
    const edit = (overrides = {}) => ({
      content: 'Kael opende de deur.',
      baseContent: 'Mira opende de deur.',
      editedBy: 'member-1',
      editedByName: 'Mira',
      markCompleted: false,
      ...overrides,
    });

    it('stores the edited story as a new version, signed by the member', async () => {
      stored = { id: 's1', content: 'Mira opende de deur.', status: 'completed', storyRegenerationCount: 3 };
      const service = await setup('en');

      await expect(service.saveStoryEdit('s1', edit())).resolves.toBe(true);

      expect(patchInTransaction).toHaveBeenCalledWith('s1', expect.any(Function));
      expect(written).toHaveBeenCalledWith({
        content: 'Kael opende de deur.',
        storyEditedAt: expect.any(String),
        storyEditedBy: 'member-1',
        storyEditedByName: 'Mira',
        storyRegenerationCount: 4,
        updatedAt: expect.any(String),
      });
    });

    it('counts a story that was never replaced as version 1', async () => {
      stored = { id: 's1', content: 'Mira opende de deur.', status: 'completed' };
      const service = await setup('en');

      await service.saveStoryEdit('s1', edit());

      expect(written).toHaveBeenCalledWith(expect.objectContaining({ storyRegenerationCount: 2 }));
    });

    it('writes nothing when someone else changed the story in the meantime', async () => {
      stored = { id: 's1', content: 'Thalia opende de deur.', status: 'completed' };
      const service = await setup('en');

      await expect(service.saveStoryEdit('s1', edit())).resolves.toBe(false);

      expect(written).not.toHaveBeenCalled();
    });

    it('writes nothing for a session that no longer exists', async () => {
      stored = null;
      const service = await setup('en');

      await expect(service.saveStoryEdit('s1', edit())).resolves.toBe(false);
    });

    it('lets the session owner clear a failed status with the edit; another member leaves the status alone', async () => {
      stored = { id: 's1', content: 'Mira opende de deur.', status: 'failed' };
      const service = await setup('en');

      await service.saveStoryEdit('s1', edit({ markCompleted: true }));
      expect(written).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'completed' }));

      await service.saveStoryEdit('s1', edit());
      expect(written.mock.lastCall?.[0]).not.toHaveProperty('status');
    });
  });

  it('keeps the name the user gave', async () => {
    const service = await setup('nl');
    expect(service.createSessionDraft(upload('  The Goblin Warrens ')).title).toBe('The Goblin Warrens');
  });
});
