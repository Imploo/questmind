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
    const patch = vi.fn();

    /** A service with the versions of a campaign loaded, for a signed-in owner. */
    async function setupLoaded(): Promise<CampaignStoryService> {
      const repo = { waitForData: () => Promise.resolve(), get: () => [], patch, destroy: vi.fn() };
      TestBed.configureTestingModule({
        providers: [
          { provide: FirebaseService, useValue: { requireFunctions: () => 'functions' } },
          { provide: AuthService, useValue: { currentUser: signal({ uid: 'owner-1' }) } },
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

    it('writes the title and the text to the version, marked as edited by the owner', async () => {
      patch.mockResolvedValue(undefined);
      const service = await setupLoaded();

      await service.saveEdit({ id: 'v3' }, { title: ' De val ', content: ' Kael opende de poort. \n' });

      expect(patch).toHaveBeenCalledWith('v3', {
        title: 'De val',
        content: 'Kael opende de poort.',
        wordCount: 4,
        editedAt: expect.any(Date),
        editedBy: 'owner-1',
      });
    });

    it('passes a refused write on, for the page to report', async () => {
      patch.mockRejectedValue(new Error('permission-denied'));
      const service = await setupLoaded();

      await expect(service.saveEdit({ id: 'v3' }, { title: 'x', content: 'y' })).rejects.toThrow('permission-denied');
    });

    it('refuses when no campaign story is loaded', async () => {
      await expect(setup().saveEdit({ id: 'v3' }, { title: 'x', content: 'y' })).rejects.toThrow();
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
