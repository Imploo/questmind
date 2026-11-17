import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { CampaignVoiceIntroComponent } from './campaign-voice-intro.component';
import { CampaignVoiceIntro } from './campaign.models';
import { I18nService } from '../core/i18n/i18n.service';
import { provideTestLanguage } from '../core/i18n/testing';
import { en } from '../core/i18n/en';
import { nl } from '../core/i18n/nl';

const voiceIntro: CampaignVoiceIntro = {
  storagePath: 'campaigns/campaign-1/voice-intro/1-intro.mp3',
  fileName: 'intro.mp3',
  mimeType: 'audio/mpeg',
  sizeBytes: 1024,
  durationSec: 95,
  uploadedAt: '2026-10-21T00:00:00.000Z',
  uploadedBy: 'user-1'
};

describe('CampaignVoiceIntroComponent', () => {
  let fixture: ComponentFixture<CampaignVoiceIntroComponent>;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideTestLanguage('en')] });
    fixture = TestBed.createComponent(CampaignVoiceIntroComponent);
    element = fixture.nativeElement as HTMLElement;
  });

  it('shows an empty state and upload button for the owner', () => {
    fixture.componentRef.setInput('canEdit', true);
    fixture.detectChanges();

    expect(element.textContent).toContain(en.campaign.voiceIntro.empty);
    expect(element.textContent).toContain(en.campaign.voiceIntro.upload);
    expect(element.querySelector('input[type="file"]')).not.toBeNull();
  });

  it('shows the current recording with duration and player', () => {
    fixture.componentRef.setInput('voiceIntro', voiceIntro);
    fixture.componentRef.setInput('playbackUrl', 'https://example.com/intro.mp3');
    fixture.componentRef.setInput('canEdit', true);
    fixture.detectChanges();

    expect(element.textContent).toContain('intro.mp3');
    expect(element.textContent).toContain('1:35');
    expect(element.textContent).toContain(en.campaign.voiceIntro.replace);
    expect(element.querySelector('audio')).not.toBeNull();
  });

  it('hides edit controls for members', () => {
    fixture.componentRef.setInput('voiceIntro', voiceIntro);
    fixture.detectChanges();

    expect(element.querySelector('input[type="file"]')).toBeNull();
    expect(element.textContent).not.toContain(en.common.remove);
  });

  it('emits the selected file', () => {
    fixture.componentRef.setInput('canEdit', true);
    fixture.detectChanges();
    const emitted: File[] = [];
    fixture.componentInstance.fileSelected.subscribe((file) => emitted.push(file));

    const file = new File(['audio'], 'intro.mp3', { type: 'audio/mpeg' });
    const input = element.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));

    expect(emitted).toEqual([file]);
  });

  it('emits a remove request', () => {
    fixture.componentRef.setInput('voiceIntro', voiceIntro);
    fixture.componentRef.setInput('canEdit', true);
    fixture.detectChanges();
    let removed = false;
    fixture.componentInstance.removeRequested.subscribe(() => (removed = true));

    const removeButton = Array.from(element.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(en.common.remove)
    );
    removeButton?.click();

    expect(removed).toBe(true);
  });

  it('shows progress and errors', () => {
    fixture.componentRef.setInput('progress', 40);
    fixture.componentRef.setInput('errorMessage', 'Upload failed');
    fixture.detectChanges();

    expect(element.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('40');
    expect(element.textContent).toContain('Upload failed');
  });

  it('explains the recording in three parts, with the example emphasised', () => {
    fixture.detectChanges();

    const help = element.querySelector('.qm-help');
    expect(help?.textContent).toContain(en.campaign.voiceIntro.helpBefore);
    expect(help?.querySelector('em')?.textContent).toBe(en.campaign.voiceIntro.helpExample);
    expect(help?.textContent).toContain(en.campaign.voiceIntro.helpAfter);
  });

  it('switches to Dutch without a reload', () => {
    fixture.componentRef.setInput('canEdit', true);
    fixture.detectChanges();
    expect(element.textContent).toContain(en.campaign.voiceIntro.title);

    TestBed.inject(I18nService).use('nl');
    fixture.detectChanges();

    expect(element.textContent).toContain(nl.campaign.voiceIntro.title);
    expect(element.textContent).toContain(nl.campaign.voiceIntro.upload);
    expect(element.querySelector('em')?.textContent).toBe(nl.campaign.voiceIntro.helpExample);
    expect(element.textContent).not.toContain(en.campaign.voiceIntro.title);
  });
});
