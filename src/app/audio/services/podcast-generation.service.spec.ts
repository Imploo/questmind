import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PodcastGenerationService } from './podcast-generation.service';
import { PodcastAudioService } from './podcast-audio.service';
import { AudioSessionRecord, SessionProgressStage } from './audio-session.models';
import { ToastService } from '../../shared/services/toast.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { en } from '../../core/i18n/en';
import { nl } from '../../core/i18n/nl';
import { provideTestLanguage } from '../../core/i18n/testing';

const session = (overrides: Partial<AudioSessionRecord> = {}): AudioSessionRecord => ({
  id: 's1',
  campaignId: 'c1',
  ownerId: 'u1',
  ownerEmail: 'owner@example.com',
  createdBy: 'u1',
  title: 'The Goblin Warrens',
  content: 'Once upon a time...',
  sessionDate: '2026-10-27',
  createdAt: '2026-10-27T10:00:00.000Z',
  updatedAt: '2026-10-27T10:00:00.000Z',
  status: 'completed',
  ...overrides,
});

const withStage = (stage: SessionProgressStage) =>
  session({
    progress: { stage, progress: 40, message: 'Podcast script schrijven...', startedAt: new Date(), updatedAt: new Date() },
  });

describe('PodcastGenerationService', () => {
  const startPodcastGeneration = vi.fn();
  const showCallableError = vi.fn();
  let service: PodcastGenerationService;

  function setup(language: 'nl' | 'en' = 'en'): void {
    TestBed.configureTestingModule({
      providers: [
        PodcastGenerationService,
        { provide: PodcastAudioService, useValue: { startPodcastGeneration } },
        { provide: ToastService, useValue: { showCallableError } },
        provideTestLanguage(language),
      ],
    });
    service = TestBed.inject(PodcastGenerationService);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    startPodcastGeneration.mockResolvedValue(1);
  });

  describe('statusFor', () => {
    it.each<[SessionProgressStage, string]>([
      ['generating-podcast-script', en.podcast.steps.script],
      ['generating-podcast-audio', en.podcast.steps.audio],
    ])('translates stage %s and never passes the stored message on', (stage, message) => {
      setup();
      expect(service.statusFor(withStage(stage))).toEqual({ isGenerating: true, message, percent: 40 });
    });

    it('is idle for a session that is doing something else', () => {
      setup();
      expect(service.statusFor(withStage('transcribing')).isGenerating).toBe(false);
      expect(service.statusFor(null).isGenerating).toBe(false);
    });

    it('follows the language', () => {
      setup();
      const generating = withStage('generating-podcast-audio');
      TestBed.inject(I18nService).use('nl');
      expect(service.statusFor(generating).message).toBe(nl.podcast.steps.audio);
    });
  });

  describe('generate', () => {
    it('sends the title of the session', async () => {
      setup();
      await service.generate(session());
      expect(startPodcastGeneration).toHaveBeenCalledWith('c1', 's1', 'The Goblin Warrens', '2026-10-27');
      expect(service.error()).toBe('');
    });

    it.each([
      ['en', en.audio.untitledSession],
      ['nl', nl.audio.untitledSession],
    ] as const)('names a session without a title in the active language (%s)', async (language, title) => {
      setup(language);
      await service.generate(session({ title: '' }));
      expect(startPodcastGeneration).toHaveBeenCalledWith('c1', 's1', title, '2026-10-27');
    });

    it('refuses a session without a story', async () => {
      setup();
      await service.generate(session({ content: '' }));
      expect(startPodcastGeneration).not.toHaveBeenCalled();
      expect(service.error()).toBe(en.errors.reasons.sessionHasNoStory);
    });

    it('shows the text of the reason the backend refuses with, not its message', async () => {
      setup();
      startPodcastGeneration.mockRejectedValue(
        Object.assign(new Error('Er wordt al een podcast gegenereerd.'), {
          code: 'functions/failed-precondition',
          details: { reason: 'podcast-already-generating' },
        })
      );
      await service.generate(session());
      expect(service.error()).toBe(en.errors.reasons.podcastAlreadyGenerating);
    });

    it('shows a general text for any other failure, not the message of the error', async () => {
      setup('nl');
      startPodcastGeneration.mockRejectedValue(new Error('Gemini quota exceeded'));
      await service.generate(session());
      expect(service.error()).toBe(nl.podcast.session.startFailed);
    });

    it('tells a user without rights so, also in a toast', async () => {
      setup();
      const denied = Object.assign(new Error('Not a member'), { code: 'functions/permission-denied' });
      startPodcastGeneration.mockRejectedValue(denied);
      await service.generate(session());
      expect(showCallableError).toHaveBeenCalledWith(denied);
      expect(service.error()).toBe(en.errors.permissionDenied);
    });
  });
});
