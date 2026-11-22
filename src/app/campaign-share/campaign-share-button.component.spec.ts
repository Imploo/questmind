import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { CampaignShareButtonComponent } from './campaign-share-button.component';
import { CampaignShareService } from './campaign-share.service';
import { ToastService } from '../shared/services/toast.service';
import { en } from '../core/i18n/en';
import { nl } from '../core/i18n/nl';
import { provideTestLanguage } from '../core/i18n/testing';

describe('CampaignShareButtonComponent', () => {
  let fixture: ComponentFixture<CampaignShareButtonComponent>;
  const createShareUrl = vi.fn();
  const show = vi.fn();
  const showCallableError = vi.fn();
  const writeText = vi.fn();
  const URL = 'https://questmind.nl/share/campaign/abc';

  function setup(language: 'nl' | 'en' = 'en'): HTMLButtonElement {
    TestBed.configureTestingModule({
      providers: [
        { provide: CampaignShareService, useValue: { createShareUrl } },
        { provide: ToastService, useValue: { show, showCallableError } },
        provideTestLanguage(language),
      ],
    });
    fixture = TestBed.createComponent(CampaignShareButtonComponent);
    fixture.componentRef.setInput('campaignId', 'c1');
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('button') as HTMLButtonElement;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // Force the writeText path: jsdom has no ClipboardItem.
    vi.stubGlobal('ClipboardItem', undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    writeText.mockResolvedValue(undefined);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('is a large square button that says what it does', () => {
    const button = setup('nl');
    expect(button.classList).toContain('qm-btn-lg');
    expect(button.classList).toContain('qm-btn-icon');
    expect(button.getAttribute('aria-label')).toBe(nl.campaign.share.button);
  });

  it('creates the share link in the sharer\'s language and copies it', async () => {
    setup('nl');
    createShareUrl.mockResolvedValue(URL);

    await fixture.componentInstance.share();

    expect(createShareUrl).toHaveBeenCalledWith('c1', 'nl');
    expect(writeText).toHaveBeenCalledWith(URL);
    expect(show).toHaveBeenCalledWith(nl.campaign.share.copied, 'success');
    expect(fixture.componentInstance.copied()).toBe(true);
  });

  it('shows the link for manual copying when the clipboard is blocked', async () => {
    setup();
    createShareUrl.mockResolvedValue(URL);
    writeText.mockRejectedValue(new Error('NotAllowedError'));
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null);

    await fixture.componentInstance.share();

    expect(prompt).toHaveBeenCalledWith(en.campaign.share.copyPrompt, URL);
  });

  it('says so when creating the link fails', async () => {
    setup();
    createShareUrl.mockRejectedValue(new Error('permission-denied'));

    await fixture.componentInstance.share();

    expect(writeText).not.toHaveBeenCalled();
    expect(showCallableError).toHaveBeenCalledWith(expect.any(Error), en.campaign.share.failed);
    expect(fixture.componentInstance.busy()).toBe(false);
  });
});
