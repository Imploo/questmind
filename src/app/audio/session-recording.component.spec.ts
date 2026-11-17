import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { en } from '../core/i18n/en';
import { nl } from '../core/i18n/nl';
import { I18nService } from '../core/i18n/i18n.service';
import { provideTestLanguage } from '../core/i18n/testing';
import { SessionRecordingComponent } from './session-recording.component';

describe('SessionRecordingComponent', () => {
  let fixture: ComponentFixture<SessionRecordingComponent>;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideTestLanguage('en')] });
    fixture = TestBed.createComponent(SessionRecordingComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('durationSec', 13182);
    fixture.componentRef.setInput('sizeBytes', 2 * 1024 * 1024);
  });

  function render(inputs: Record<string, unknown> = {}): void {
    for (const [name, input] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, input);
    }
    fixture.detectChanges();
  }

  it('shows the player of the recording, with its length in hours and nothing fetched up front', () => {
    render({ audioUrl: 'https://storage.example/recording.mp3', fileName: 'sessie-1.mp3' });

    const audio = element.querySelector('audio') as HTMLAudioElement;
    expect(audio.preload).toBe('none');
    expect(element.querySelector('button.qm-play')?.getAttribute('aria-label')).toBe(en.audio.recording.play);
    expect((element.querySelector('input[type="range"]') as HTMLInputElement).max).toBe('13182');
    expect(element.textContent).toContain('0:00:00');
    expect(element.textContent).toContain('3:39:42');
    expect(element.textContent).toContain(`2.0 MB · ${en.audio.recording.treatment}`);
    expect(element.querySelector('a[download]')?.getAttribute('download')).toBe('sessie-1.mp3');
  });

  it('shows the details without a player while the recording is not there yet', () => {
    render();

    expect(element.querySelector('audio')).toBeNull();
    expect(element.querySelector('button.qm-play')).toBeNull();
    expect(element.querySelector('a[download]')).toBeNull();
    expect(element.textContent).toContain(`3:39:42 · 2.0 MB · ${en.audio.recording.treatment}`);
  });

  it('follows the language, down to the labels of the player', async () => {
    render({ audioUrl: 'https://storage.example/recording.mp3', fileName: 'sessie-1.mp3' });

    TestBed.inject(I18nService).use('nl');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.querySelector('h3')?.textContent).toBe(nl.audio.recording.title);
    expect(element.querySelector('button.qm-play')?.getAttribute('aria-label')).toBe('Opname afspelen');
    expect(element.querySelector('input[type="range"]')?.getAttribute('aria-label')).toBe('Positie in de opname');
    expect(element.textContent).toContain(`2.0 MB · ${nl.audio.recording.treatment}`);
  });

  it('offers re-transcription only to who may, and not while the session is busy', () => {
    const button = () => [...element.querySelectorAll('button')].find(b => b.textContent?.includes(en.audio.recording.retranscribe));
    let emitted = 0;
    fixture.componentInstance.retranscribe.subscribe(() => emitted++);

    render();
    expect(button()).toBeUndefined();

    render({ canRetranscribe: true });
    button()?.click();
    expect(emitted).toBe(1);

    render({ busy: true });
    expect(button()?.disabled).toBe(true);
  });
});
