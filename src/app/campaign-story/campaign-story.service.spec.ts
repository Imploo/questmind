import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ApplicationRef, signal } from '@angular/core';
import { CampaignStoryService } from './campaign-story.service';
import { FirebaseService } from '../core/firebase.service';
import { AuthService } from '../auth/auth.service';
import { CampaignContextService } from '../campaign/campaign-context.service';
import { CampaignStoryRepositoryFactory } from '../shared/repository/campaign-story.repository';
import { ToastService } from '../shared/services/toast.service';
import { I18nService } from '../core/i18n/i18n.service';
import { provideTestLanguage } from '../core/i18n/testing';
import { en } from '../core/i18n/en';
import { nl } from '../core/i18n/nl';

describe('CampaignStoryService', () => {
  const toast = { showCallableError: vi.fn() };

  interface Invoke {
    invoke: (call: () => Promise<unknown>, label: string) => Promise<void>;
  }

  function setup(language: 'nl' | 'en' = 'en'): CampaignStoryService {
    TestBed.configureTestingModule({
      providers: [
        { provide: FirebaseService, useValue: { requireFunctions: () => 'functions' } },
        { provide: AuthService, useValue: { currentUser: signal(null) } },
        { provide: CampaignContextService, useValue: { selectedCampaignId: signal(null) } },
        { provide: CampaignStoryRepositoryFactory, useValue: { create: vi.fn() } },
        { provide: ToastService, useValue: toast },
        provideTestLanguage(language),
      ],
    });
    return TestBed.inject(CampaignStoryService);
  }

  /** A refused callable, the way the Firebase SDK reports it. */
  const refusal = (code: string, message: string, reason?: string) =>
    Object.assign(new Error(message), { code: `functions/${code}`, details: reason ? { reason } : undefined });

  /**
   * Runs a call that fails with `failure` through the service's error handling, the way
   * `generate` and `generatePodcast` do. The callable itself is left out: spec files share
   * their modules, so mocking `firebase/functions` is not reliable here.
   */
  const start = (service: CampaignStoryService, failure: unknown): Promise<void> =>
    (service as unknown as Invoke).invoke(() => Promise.reject(failure), 'campaign story');

  const messageOf = (call: Promise<void>) =>
    call.then(
      () => null,
      (error: Error) => error.message
    );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('saveEdit', () => {
    /** The version as it is stored at the moment of the transaction. */
    let stored: Record<string, unknown> | null = null;
    const written = vi.fn();
    const patchInTransaction = vi.fn(
      async (_id: string, decide: (current: Record<string, unknown> | null) => Record<string, unknown> | null) => {
        const patch = decide(stored);
        if (!patch) return false;
        written(patch);
        return true;
      }
    );
    const base = { title: 'De val', content: 'Mira opende de poort.' };
    const edit = { title: ' De val ', content: ' Kael opende de poort. \n', base };

    /** A service with the versions of a campaign loaded, for a signed-in owner. */
    async function setupLoaded(): Promise<CampaignStoryService> {
      const repo = { waitForData: () => Promise.resolve(), get: () => [], patchInTransaction, destroy: vi.fn() };
      TestBed.configureTestingModule({
        providers: [
          { provide: FirebaseService, useValue: { requireFunctions: () => 'functions' } },
          { provide: AuthService, useValue: { currentUser: signal({ uid: 'member-1', displayName: 'Mira' }) } },
          { provide: CampaignContextService, useValue: { selectedCampaignId: signal('campaign-1') } },
          { provide: CampaignStoryRepositoryFactory, useValue: { create: () => repo } },
          { provide: ToastService, useValue: toast },
          provideTestLanguage('en'),
        ],
      });
      const service = TestBed.inject(CampaignStoryService);
      service.versions();
      await TestBed.inject(ApplicationRef).whenStable();
      return service;
    }

    it('writes the title and the text to the version, signed by the member who edited it', async () => {
      stored = { id: 'v3', status: 'completed', ...base };
      const service = await setupLoaded();

      await expect(service.saveEdit({ id: 'v3' }, edit)).resolves.toBe(true);

      expect(patchInTransaction).toHaveBeenCalledWith('v3', expect.any(Function));
      expect(written).toHaveBeenCalledWith({
        title: 'De val',
        content: 'Kael opende de poort.',
        wordCount: 4,
        editedAt: expect.any(Date),
        editedBy: 'member-1',
        editedByName: 'Mira',
      });
    });

    it.each([
      ['the text', { status: 'completed', title: 'De val', content: 'Thalia opende de poort.' }],
      ['the title', { status: 'completed', title: 'De opkomst', content: 'Mira opende de poort.' }],
    ])('writes nothing when someone else changed %s in the meantime', async (_what, current) => {
      stored = { id: 'v3', ...current };
      const service = await setupLoaded();

      await expect(service.saveEdit({ id: 'v3' }, edit)).resolves.toBe(false);

      expect(written).not.toHaveBeenCalled();
    });

    it('treats a version without a title as an empty title', async () => {
      stored = { id: 'v3', status: 'completed', content: 'Mira opende de poort.' };
      const service = await setupLoaded();

      await expect(service.saveEdit({ id: 'v3' }, { ...edit, base: { title: '', content: base.content } })).resolves.toBe(true);
    });

    it('passes a refused write on, for the page to report', async () => {
      patchInTransaction.mockRejectedValueOnce(new Error('permission-denied'));
      const service = await setupLoaded();

      await expect(service.saveEdit({ id: 'v3' }, edit)).rejects.toThrow('permission-denied');
    });

    it('refuses when no campaign story is loaded', async () => {
      await expect(setup().saveEdit({ id: 'v3' }, edit)).rejects.toThrow();
    });
  });

  it('treats a client-side timeout as still running', async () => {
    const timeout = refusal('deadline-exceeded', 'deadline-exceeded');

    await expect(start(setup(), timeout)).resolves.toBeUndefined();
  });

  it('translates the reason of a refusal instead of showing the server message', async () => {
    const refused = refusal('failed-precondition', 'Er wordt al een verhaal gegenereerd.', 'story-already-generating');

    expect(await messageOf(start(setup(), refused))).toBe(en.errors.reasons.storyAlreadyGenerating);
  });

  it.each([
    ['story-already-generating', nl.errors.reasons.storyAlreadyGenerating],
    ['no-session-stories', nl.errors.reasons.noSessionStories],
    ['story-version-not-ready', nl.errors.reasons.storyVersionNotReady],
  ])('gives the reason %s its Dutch text for a Dutch user', async (reason, text) => {
    const refused = refusal('failed-precondition', 'An English message for the logs', reason);

    expect(await messageOf(start(setup('nl'), refused))).toBe(text);
  });

  it('falls back on its own text for a refusal without a reason (a backend that does not send one yet)', async () => {
    const refused = refusal('failed-precondition', 'Er wordt al een verhaal gegenereerd.');

    expect(await messageOf(start(setup(), refused))).toBe(en.campaignStory.startFailed);
  });

  it('falls back on its own text for an unexpected failure', async () => {
    expect(await messageOf(start(setup('nl'), refusal('internal', 'INTERNAL')))).toBe(nl.campaignStory.startFailed);
  });

  it('explains a lack of rights, in a toast and in the message', async () => {
    const denied = refusal('permission-denied', 'Only the owner can do this');

    expect(await messageOf(start(setup(), denied))).toBe(en.errors.permissionDenied);
    expect(toast.showCallableError).toHaveBeenCalledWith(denied);
  });

  it('uses the language active at the moment of the failure', async () => {
    const service = setup();
    TestBed.inject(I18nService).use('nl');

    const refused = refusal('failed-precondition', 'x', 'no-session-stories');
    expect(await messageOf(start(service, refused))).toBe(nl.errors.reasons.noSessionStories);
  });
});
