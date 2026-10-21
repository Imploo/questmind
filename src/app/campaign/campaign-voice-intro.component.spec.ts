import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { CampaignVoiceIntroComponent } from './campaign-voice-intro.component';
import { CampaignVoiceIntro } from './campaign.models';

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
    fixture = TestBed.createComponent(CampaignVoiceIntroComponent);
    element = fixture.nativeElement as HTMLElement;
  });

  it('shows an empty state and upload button for the owner', () => {
    fixture.componentRef.setInput('canEdit', true);
    fixture.detectChanges();

    expect(element.textContent).toContain('No voice introduction uploaded yet.');
    expect(element.textContent).toContain('Upload recording');
    expect(element.querySelector('input[type="file"]')).not.toBeNull();
  });

  it('shows the current recording with duration and player', () => {
    fixture.componentRef.setInput('voiceIntro', voiceIntro);
    fixture.componentRef.setInput('playbackUrl', 'https://example.com/intro.mp3');
    fixture.componentRef.setInput('canEdit', true);
    fixture.detectChanges();

    expect(element.textContent).toContain('intro.mp3');
    expect(element.textContent).toContain('1:35');
    expect(element.textContent).toContain('Replace recording');
    expect(element.querySelector('audio')).not.toBeNull();
  });

  it('hides edit controls for members', () => {
    fixture.componentRef.setInput('voiceIntro', voiceIntro);
    fixture.detectChanges();

    expect(element.querySelector('input[type="file"]')).toBeNull();
    expect(element.textContent).not.toContain('Remove');
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
      b.textContent?.includes('Remove')
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
});
