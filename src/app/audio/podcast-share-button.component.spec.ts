import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { PodcastShareButtonComponent } from './podcast-share-button.component';
import { PodcastShareService } from './services/podcast-share.service';
import { ToastService } from '../shared/services/toast.service';
import { en } from '../core/i18n/en';
import { nl } from '../core/i18n/nl';
import { provideTestLanguage } from '../core/i18n/testing';

describe('PodcastShareButtonComponent', () => {
  let fixture: ComponentFixture<PodcastShareButtonComponent>;
  const createShareUrl = vi.fn();
  const show = vi.fn();
  const showCallableError = vi.fn();
  const writeText = vi.fn();
  const target = { campaignId: 'c1', sessionId: 's1', podcastVersion: 2 };

  function setup(language: 'nl' | 'en' = 'en'): void {
    TestBed.configureTestingModule({
      providers: [
        { provide: PodcastShareService, useValue: { createShareUrl } },
        { provide: ToastService, useValue: { show, showCallableError } },
        provideTestLanguage(language),
      ],
    });
    fixture = TestBed.createComponent(PodcastShareButtonComponent);
    fixture.componentRef.setInput('target', target);
    fixture.detectChanges();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // Force the writeText path: jsdom has no ClipboardItem.
    vi.stubGlobal('ClipboardItem', undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    writeText.mockResolvedValue(undefined);
  });

  afterEach(() => vi.unstubAllGlobals());

  async function click(): Promise<void> {
    await fixture.componentInstance.share();
    fixture.detectChanges();
  }

  it('creates the share link and copies it to the clipboard', async () => {
    setup();
    createShareUrl.mockResolvedValue('https://questmind.nl/share/podcast/abc');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(en.common.share);

    await click();

    // The sharer's language goes along: the link preview is written in it.
    expect(createShareUrl).toHaveBeenCalledWith(target, 'en');
    expect(writeText).toHaveBeenCalledWith('https://questmind.nl/share/podcast/abc');
    expect(show).toHaveBeenCalledWith(en.podcast.share.copiedToast, 'success');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(en.podcast.share.copied);
  });

  it('shows the link for manual copying when the clipboard is blocked', async () => {
    setup();
    createShareUrl.mockResolvedValue('https://questmind.nl/share/podcast/abc');
    writeText.mockRejectedValue(new Error('NotAllowedError'));
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null);

    await click();

    expect(prompt).toHaveBeenCalledWith(en.podcast.share.copyPrompt, 'https://questmind.nl/share/podcast/abc');
  });

  it('shows an error toast when creating the link fails', async () => {
    setup();
    createShareUrl.mockRejectedValue(new Error('permission-denied'));

    await click();

    expect(writeText).not.toHaveBeenCalled();
    expect(showCallableError).toHaveBeenCalledWith(expect.any(Error), en.podcast.share.failed);
  });

  it('says why when the backend refuses with a reason, and never shows its message', async () => {
    setup();
    const refusal = Object.assign(new Error('Deze podcast is nog niet klaar om te delen.'), {
      code: 'functions/failed-precondition',
      details: { reason: 'podcast-not-ready' },
    });
    createShareUrl.mockRejectedValue(refusal);

    await click();

    expect(showCallableError).toHaveBeenCalledWith(refusal, en.errors.reasons.podcastNotReady);
  });

  it('speaks Dutch when that is the language', async () => {
    setup('nl');
    createShareUrl.mockResolvedValue('https://questmind.nl/share/podcast/abc');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(nl.common.share);

    await click();

    expect(createShareUrl).toHaveBeenCalledWith(target, 'nl');
    expect(show).toHaveBeenCalledWith(nl.podcast.share.copiedToast, 'success');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(nl.podcast.share.copied);
  });
});
