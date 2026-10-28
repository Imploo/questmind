import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { PodcastShareButtonComponent } from './podcast-share-button.component';
import { PodcastShareService } from './services/podcast-share.service';
import { ToastService } from '../shared/services/toast.service';

describe('PodcastShareButtonComponent', () => {
  let fixture: ComponentFixture<PodcastShareButtonComponent>;
  const createShareUrl = vi.fn();
  const show = vi.fn();
  const showCallableError = vi.fn();
  const writeText = vi.fn();
  const target = { campaignId: 'c1', sessionId: 's1', podcastVersion: 2 };

  beforeEach(() => {
    vi.clearAllMocks();
    // Force the writeText path: jsdom has no ClipboardItem.
    vi.stubGlobal('ClipboardItem', undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    writeText.mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      providers: [
        { provide: PodcastShareService, useValue: { createShareUrl } },
        { provide: ToastService, useValue: { show, showCallableError } },
      ],
    });
    fixture = TestBed.createComponent(PodcastShareButtonComponent);
    fixture.componentRef.setInput('target', target);
    fixture.detectChanges();
  });

  afterEach(() => vi.unstubAllGlobals());

  async function click(): Promise<void> {
    await fixture.componentInstance.share();
    fixture.detectChanges();
  }

  it('creates the share link and copies it to the clipboard', async () => {
    createShareUrl.mockResolvedValue('https://questmind.nl/share/podcast/abc');

    await click();

    expect(createShareUrl).toHaveBeenCalledWith(target);
    expect(writeText).toHaveBeenCalledWith('https://questmind.nl/share/podcast/abc');
    expect(show).toHaveBeenCalledWith(expect.stringContaining('Link gekopieerd'), 'success');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Link gekopieerd');
  });

  it('shows the link for manual copying when the clipboard is blocked', async () => {
    createShareUrl.mockResolvedValue('https://questmind.nl/share/podcast/abc');
    writeText.mockRejectedValue(new Error('NotAllowedError'));
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null);

    await click();

    expect(prompt).toHaveBeenCalledWith(expect.any(String), 'https://questmind.nl/share/podcast/abc');
  });

  it('shows an error toast when creating the link fails', async () => {
    createShareUrl.mockRejectedValue(new Error('permission-denied'));

    await click();

    expect(writeText).not.toHaveBeenCalled();
    expect(showCallableError).toHaveBeenCalledWith(expect.any(Error), expect.stringContaining('mislukt'));
  });
});
