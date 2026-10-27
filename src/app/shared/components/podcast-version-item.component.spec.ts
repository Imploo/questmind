import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { PodcastVersionItemComponent } from './podcast-version-item.component';
import { PodcastShareService } from '../../audio/services/podcast-share.service';
import { PodcastStatus, PodcastVersion } from '../../audio/services/audio-session.models';

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

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: PodcastShareService, useValue: { createShareUrl: () => Promise.resolve('') } }],
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

  it.each<[PodcastStatus, string]>([
    ['pending', 'Bezig...'],
    ['script_complete', 'Audio genereren...'],
    ['completed', 'Klaar'],
    ['failed', 'Mislukt'],
  ])('shows a badge for status %s', (value, label) => {
    render(podcast({ status: value }));
    expect(status()).toBe(label);
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

  it('hides download and player without audio, and shows the error of a failed podcast', () => {
    render(podcast({ status: 'failed', audioUrl: undefined, error: 'TTS quota' }));

    expect(element.querySelector('a[download]')).toBeNull();
    expect(element.querySelector('audio')).toBeNull();
    expect(element.textContent).toContain('TTS quota');
  });

  it('shows the share button only with a share target, disabled until the podcast is ready', () => {
    render(podcast({ status: 'pending', audioUrl: undefined }));
    expect(element.querySelector('app-podcast-share-button')).toBeNull();

    render(podcast({ status: 'pending', audioUrl: undefined }), {
      shareTarget: { campaignId: 'c1', sessionId: 's1', podcastVersion: 3 },
    });
    const button = element.querySelector('app-podcast-share-button button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('shows the script only when asked', () => {
    const withScript = podcast({ script: { segments: [{ speaker: 'host1', text: 'Welkom terug!' }], estimatedDuration: 60 } });
    render(withScript);
    expect(element.textContent).not.toContain('Welkom terug!');

    render(withScript, { showScript: true });
    expect(element.textContent).toContain('Welkom terug!');
  });
});
