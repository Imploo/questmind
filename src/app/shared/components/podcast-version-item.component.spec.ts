import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { PodcastVersionItemComponent } from './podcast-version-item.component';
import { PodcastShareService } from '../../audio/services/podcast-share.service';
import { PodcastDeleteService } from '../../audio/services/podcast-delete.service';
import { ToastService } from '../services/toast.service';
import { PodcastProgressStep, PodcastStatus, PodcastVersion } from '../../audio/services/audio-session.models';
import { I18nService } from '../../core/i18n/i18n.service';
import { en } from '../../core/i18n/en';
import { nl } from '../../core/i18n/nl';
import { provideTestLanguage } from '../../core/i18n/testing';

const podcast = (overrides: Partial<PodcastVersion> = {}): PodcastVersion => ({
  version: 3,
  createdAt: new Date('2026-10-27T10:00:00Z'),
  status: 'completed',
  audioUrl: 'https://storage.example/podcast.mp3',
  duration: 125,
  fileSize: 2 * 1024 * 1024,
  ...overrides,
});

describe('PodcastVersionItemComponent', () => {
  let fixture: ComponentFixture<PodcastVersionItemComponent>;
  let element: HTMLElement;
  const deletePodcast = vi.fn();
  const toast = { confirm: vi.fn(), show: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        provideTestLanguage('en'),
        { provide: PodcastShareService, useValue: { createShareUrl: () => Promise.resolve('') } },
        { provide: PodcastDeleteService, useValue: { delete: deletePodcast } },
        { provide: ToastService, useValue: toast },
      ],
    });
    fixture = TestBed.createComponent(PodcastVersionItemComponent);
    element = fixture.nativeElement as HTMLElement;
  });

  function render(value: PodcastVersion, inputs: Record<string, unknown> = {}): void {
    fixture.componentRef.setInput('podcast', value);
    for (const [name, input] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, input);
    }
    fixture.detectChanges();
  }

  const status = () => element.querySelector('[data-testid="podcast-status"]')?.textContent?.trim();
  const part = () => element.querySelector('[data-testid="podcast-part"]')?.textContent?.trim();

  it.each<[PodcastStatus, string]>([
    ['pending', en.common.busy],
    ['script_complete', en.podcast.status.generatingAudio],
    ['completed', en.podcast.status.ready],
    ['failed', en.common.failed],
  ])('shows a badge for status %s', (value, label) => {
    render(podcast({ status: value }));
    expect(status()).toBe(label);
  });

  it.each<[PodcastProgressStep, string]>([
    ['starting', en.podcast.steps.starting],
    ['script', en.podcast.steps.script],
    ['audio', en.podcast.steps.audio],
    ['uploading', en.podcast.steps.uploading],
  ])('translates the step %s of a podcast in the making', (step, label) => {
    render(podcast({ status: 'pending', audioUrl: undefined, progressStep: step }));
    expect(status()).toBe(label);
  });

  it('never shows the stored progress message', () => {
    render(podcast({ status: 'pending', audioUrl: undefined, progressMessage: 'Audio genereren (deel 2/5)...' }));
    expect(status()).toBe(en.common.busy);
    expect(element.textContent).not.toContain('deel 2/5');

    render(podcast({ status: 'pending', audioUrl: undefined, progressStep: 'audio', progressMessage: 'Audio genereren (deel 2/5)...' }));
    expect(status()).toBe(en.podcast.steps.audio);
    expect(element.textContent).not.toContain('deel 2/5');
  });

  it('falls back on the status for a step it does not know', () => {
    render(podcast({ status: 'script_complete', audioUrl: undefined, progressStep: 'mixing' as PodcastProgressStep }));
    expect(status()).toBe(en.podcast.status.generatingAudio);
  });

  it('shows which part of the audio is being generated', () => {
    render(podcast({ status: 'script_complete', audioUrl: undefined, progressStep: 'audio', progressDetail: { current: 2, total: 5 } }));
    expect(status()).toBe(en.podcast.steps.audio);
    expect(part()).toBe(en.progress.partCount(2, 5));

    render(podcast({ status: 'script_complete', audioUrl: undefined, progressStep: 'uploading' }));
    expect(part()).toBeUndefined();
  });

  it('keeps the status of a finished podcast, whatever step is still stored', () => {
    render(podcast({ status: 'completed', progressStep: 'audio', progressDetail: { current: 5, total: 5 } }));
    expect(status()).toBe(en.podcast.status.ready);
    expect(part()).toBeUndefined();
  });

  it('shows duration, size, download link and player for a finished podcast', () => {
    render(podcast(), { downloadName: 'Sessie 1' });

    expect(element.textContent).toContain('2:05');
    expect(element.textContent).toContain('2.0 MB');
    const link = element.querySelector('a[download]') as HTMLAnchorElement;
    expect(link.getAttribute('download')).toBe('Sessie 1-v3.mp3');
    expect(link.href).toBe('https://storage.example/podcast.mp3');
    expect(element.querySelector('audio')).not.toBeNull();
  });

  it('hides download and player without audio, and folds the raw error of a failed podcast away', () => {
    render(podcast({ status: 'failed', audioUrl: undefined, error: 'TTS quota' }));

    expect(element.querySelector('a[download]')).toBeNull();
    expect(element.querySelector('audio')).toBeNull();
    expect(element.textContent).toContain(en.podcast.generationFailed);

    const details = element.querySelector('[data-testid="podcast-error"]')?.closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')?.textContent?.trim()).toBe(en.errors.technicalDetails);
    expect(details.textContent).toContain('TTS quota');
  });

  it('shows the share button only for a podcast with audio and a share target', () => {
    const shareTarget = { campaignId: 'c1', sessionId: 's1', podcastVersion: 3 };
    const button = () => element.querySelector('app-podcast-share-button button') as HTMLButtonElement | null;

    render(podcast());
    expect(button()).toBeNull();

    render(podcast({ status: 'pending', audioUrl: undefined }), { shareTarget });
    expect(button()).toBeNull();

    render(podcast(), { shareTarget });
    expect(button()?.disabled).toBe(false);
  });

  it('plays from the play button and shows the position on the seek bar', () => {
    render(podcast());
    const audio = element.querySelector('audio') as HTMLAudioElement;
    const play = element.querySelector('button.qm-play') as HTMLButtonElement;
    const seek = element.querySelector('input[type="range"]') as HTMLInputElement;
    expect(play.getAttribute('aria-label')).toBe(en.podcast.player.play(3));
    expect(seek.max).toBe('125');
    expect(seek.getAttribute('aria-label')).toBe(en.podcast.player.position(3));

    audio.dispatchEvent(new Event('play'));
    fixture.detectChanges();
    expect(play.getAttribute('aria-label')).toBe(en.podcast.player.pause(3));

    seek.value = '65';
    seek.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(audio.currentTime).toBe(65);
    expect(element.textContent).toContain('1:05');
    expect(seek.getAttribute('aria-valuetext')).toBe(en.podcast.player.positionValue('1:05', '2:05'));
  });

  it('names the playback speed in the notation of the language', () => {
    render(podcast());
    const speed = Array.from(element.querySelectorAll('button')).find(button => button.textContent?.includes('×')) as HTMLButtonElement;
    expect(speed.textContent?.trim()).toBe('1×');

    speed.click();
    speed.click();
    fixture.detectChanges();
    expect(speed.textContent?.trim()).toBe('1.5×');
    expect(speed.getAttribute('aria-label')).toBe(en.podcast.player.speedLabel('1.5'));

    TestBed.inject(I18nService).use('nl');
    fixture.detectChanges();
    expect(speed.textContent?.trim()).toBe('1,5×');
    expect(speed.getAttribute('aria-label')).toBe(nl.podcast.player.speedLabel('1,5'));
  });

  it('disables the player when the audio cannot be loaded', () => {
    render(podcast());
    (element.querySelector('audio') as HTMLAudioElement).dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect((element.querySelector('button.qm-play') as HTMLButtonElement).disabled).toBe(true);
    expect(element.textContent).toContain(en.podcast.player.loadFailed);
  });

  it('shows the script only when asked', () => {
    const withScript = podcast({ script: { segments: [{ speaker: 'host1', text: 'Welkom terug!' }], estimatedDuration: 60 } });
    render(withScript);
    expect(element.textContent).not.toContain('Welkom terug!');

    render(withScript, { showScript: true });
    expect(element.textContent).toContain('Welkom terug!');
    expect(element.textContent).toContain(`${en.podcast.host1}:`);
  });

  it('switches every text when the language changes', () => {
    render(podcast({ status: 'pending', audioUrl: undefined, progressStep: 'script' }));
    expect(status()).toBe(en.podcast.steps.script);

    TestBed.inject(I18nService).use('nl');
    fixture.detectChanges();
    expect(status()).toBe(nl.podcast.steps.script);
  });

  describe('deleting', () => {
    const target = { campaignId: 'c1', sessionId: 's1', podcastVersion: 3 };
    const deleteButton = () => element.querySelector('[data-testid="podcast-delete"]') as HTMLButtonElement | null;

    it('is only offered to the campaign owner', () => {
      render(podcast(), { shareTarget: target });
      expect(deleteButton()).toBeNull();

      fixture.componentRef.setInput('canDelete', true);
      fixture.detectChanges();
      expect(deleteButton()?.getAttribute('aria-label')).toBe(en.podcast.deleteLabel(3));
    });

    it('is offered for a failed podcast, which has no audio', () => {
      render(podcast({ status: 'failed', audioUrl: undefined, error: 'boom' }), { shareTarget: target, canDelete: true });
      expect(deleteButton()).not.toBeNull();
    });

    it('is not offered while the podcast is being made, but is once that was abandoned', () => {
      render(podcast({ status: 'pending', audioUrl: undefined, createdAt: new Date() }), { shareTarget: target, canDelete: true });
      expect(deleteButton()).toBeNull();

      fixture.componentRef.setInput('podcast', podcast({ status: 'pending', audioUrl: undefined, createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) }));
      fixture.detectChanges();
      expect(deleteButton()).not.toBeNull();
    });

    it('asks first, then deletes', async () => {
      toast.confirm.mockResolvedValue(true);
      deletePodcast.mockResolvedValue(undefined);
      render(podcast(), { shareTarget: target, canDelete: true });

      deleteButton()?.click();
      await fixture.whenStable();

      expect(toast.confirm).toHaveBeenCalledWith(en.podcast.deleteConfirm(3));
      expect(deletePodcast).toHaveBeenCalledWith(target);
    });

    it('keeps the podcast when the owner changes their mind', async () => {
      toast.confirm.mockResolvedValue(false);
      render(podcast(), { shareTarget: target, canDelete: true });

      deleteButton()?.click();
      await fixture.whenStable();

      expect(deletePodcast).not.toHaveBeenCalled();
    });

    it('says why a podcast could not be deleted', async () => {
      toast.confirm.mockResolvedValue(true);
      deletePodcast.mockRejectedValue(
        Object.assign(new Error('still running'), { code: 'functions/failed-precondition', details: { reason: 'podcast-generating' } })
      );
      render(podcast(), { shareTarget: target, canDelete: true });

      deleteButton()?.click();
      await fixture.whenStable();

      expect(toast.show).toHaveBeenCalledWith(en.errors.reasons.podcastGenerating, 'error', 6000);
      expect(deleteButton()?.disabled).toBe(false);
    });
  });
});
