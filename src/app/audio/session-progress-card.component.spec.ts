import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { SessionProgressCardComponent } from './session-progress-card.component';
import { SessionProgressStage } from './services/audio-session.models';
import { DisplayProgress } from './services/session-progress.utils';
import { I18nService } from '../core/i18n/i18n.service';
import { en } from '../core/i18n/en';
import { nl } from '../core/i18n/nl';
import { provideTestLanguage } from '../core/i18n/testing';

const progress = (overrides: Partial<DisplayProgress> = {}): DisplayProgress => ({
  stage: 'transcribing',
  progress: 72,
  message: 'Transcribed 3 of 7 segments',
  startedAt: new Date('2026-10-27T10:00:00Z'),
  updatedAt: new Date('2026-10-27T10:05:00Z'),
  ...overrides,
});

describe('SessionProgressCardComponent', () => {
  let fixture: ComponentFixture<SessionProgressCardComponent>;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideTestLanguage('en')] });
    fixture = TestBed.createComponent(SessionProgressCardComponent);
    element = fixture.nativeElement as HTMLElement;
  });

  function render(value: DisplayProgress | null, retryUnavailableMessage: string | null = null): void {
    fixture.componentRef.setInput('progress', value);
    fixture.componentRef.setInput('retryUnavailableMessage', retryUnavailableMessage);
    fixture.detectChanges();
  }

  const title = () => element.querySelector('h3')?.textContent?.trim();
  const statusLine = () => element.querySelector('[data-testid="progress-status"]')?.textContent?.trim();
  const buttons = () => Array.from(element.querySelectorAll('button')).map(button => button.textContent?.trim());

  it.each<[SessionProgressStage, string]>([
    ['compressing', en.progress.stages.compressing],
    ['uploading', en.progress.stages.uploading],
    ['processing-audio', en.progress.stages.processingAudio],
    ['transcribing', en.progress.stages.transcribing],
    ['generating-story', en.progress.stages.generatingStory],
    ['generating-podcast-script', en.progress.stages.generatingPodcastScript],
    ['generating-podcast-audio', en.progress.stages.generatingPodcastAudio],
    ['failed', en.progress.stages.failed],
  ])('shows the translated title of stage %s', (stage, expected) => {
    render(progress({ stage }));
    expect(title()).toBe(expected);
  });

  it('shows nothing for an idle or completed session', () => {
    render(progress({ stage: 'idle' }));
    expect(element.textContent?.trim()).toBe('');
    render(progress({ stage: 'completed' }));
    expect(element.textContent?.trim()).toBe('');
  });

  it('never shows the stored message', () => {
    render(progress({ message: 'Transcribed 3 of 7 segments' }));
    expect(element.textContent).not.toContain('Transcribed 3 of 7 segments');
    expect(statusLine()).toBeUndefined();
    expect(element.textContent).toContain(en.progress.percentComplete(72));
  });

  it('shows the count of a step that counts things', () => {
    render(progress({ detail: { current: 3, total: 7 } }));
    expect(statusLine()).toBe(en.progress.segmentCount(3, 7));
  });

  it('shows a general message for a failure and folds the raw error away', () => {
    render(progress({ stage: 'failed', progress: 0, message: 'Failed: Not a RIFF/WAVE file', error: 'Not a RIFF/WAVE file' }));

    expect(statusLine()).toBe(en.progress.failedMessage);
    expect(element.textContent).not.toContain('Failed: Not a RIFF/WAVE file');
    const details = element.querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')?.textContent?.trim()).toBe(en.errors.technicalDetails);
    expect(details.querySelector('pre')?.textContent).toBe('Not a RIFF/WAVE file');
    expect(buttons()).toEqual([en.common.retry]);
  });

  it('says that a stalled operation timed out', () => {
    render(progress({ stage: 'failed', progress: 0, timedOut: true, error: 'Operation stalled at "transcribing"' }));
    expect(statusLine()).toBe(en.progress.timedOut);
  });

  it('replaces the retry button by the reason when retrying is not possible', () => {
    render(progress({ stage: 'failed', progress: 0 }), en.audio.session.noStoredAudio);
    expect(buttons()).toEqual([]);
    expect(element.querySelector('[data-testid="retry-unavailable"]')?.textContent?.trim()).toBe(en.audio.session.noStoredAudio);
  });

  it('offers to cancel a running operation and says how long it still takes', () => {
    render(progress({ estimatedCompletionAt: new Date(Date.now() + 5 * 60_000 + 30_000) }));
    expect(buttons()).toEqual([en.common.cancel]);
    expect(element.textContent).toContain(en.progress.remainingMinutes(5));
  });

  it('tells that an upload without progress continues in the background', () => {
    render(progress({ stage: 'uploading', progress: 0 }));
    expect(element.textContent).toContain(en.progress.backgroundUpload);
    expect(element.textContent).toContain(en.progress.backgroundUploadHint);
  });

  it('switches every text when the language changes', () => {
    render(progress({ detail: { current: 3, total: 7 } }));
    expect(title()).toBe(en.progress.stages.transcribing);

    TestBed.inject(I18nService).use('nl');
    fixture.detectChanges();
    expect(title()).toBe(nl.progress.stages.transcribing);
    expect(statusLine()).toBe(nl.progress.segmentCount(3, 7));
    expect(buttons()).toEqual([nl.common.cancel]);
    expect(element.textContent).toContain(nl.progress.percentComplete(72));
  });
});
