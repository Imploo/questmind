import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { SessionRecordingComponent } from './session-recording.component';

describe('SessionRecordingComponent', () => {
  let fixture: ComponentFixture<SessionRecordingComponent>;
  let element: HTMLElement;

  beforeEach(() => {
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
    expect(element.querySelector('button.qm-play')?.getAttribute('aria-label')).toBe('Speel opname');
    expect((element.querySelector('input[type="range"]') as HTMLInputElement).max).toBe('13182');
    expect(element.textContent).toContain('0:00:00');
    expect(element.textContent).toContain('3:39:42');
    expect(element.textContent).toContain('2.0 MB · compressed & normalized');
    expect(element.querySelector('a[download]')?.getAttribute('download')).toBe('sessie-1.mp3');
  });

  it('shows the details without a player while the recording is not there yet', () => {
    render();

    expect(element.querySelector('audio')).toBeNull();
    expect(element.querySelector('button.qm-play')).toBeNull();
    expect(element.querySelector('a[download]')).toBeNull();
    expect(element.textContent).toContain('3:39:42 · 2.0 MB · compressed & normalized');
  });

  it('offers re-transcription only to who may, and not while the session is busy', () => {
    const button = () => [...element.querySelectorAll('button')].find(b => b.textContent?.includes('Re-transcribe'));
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
