import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AudioUploadPageComponent } from './audio-upload-page.component';
import { AudioSessionStateService } from './services/audio-session-state.service';
import { AudioCompleteProcessingService } from './services/audio-complete-processing.service';
import { AuthService } from '../auth/auth.service';
import { CampaignContextService } from '../campaign/campaign-context.service';
import { ToastService } from '../shared/services/toast.service';
import { ScreenWakeLockService } from '../shared/services/screen-wake-lock.service';
import { en } from '../core/i18n/en';
import { nl } from '../core/i18n/nl';
import { provideTestLanguage } from '../core/i18n/testing';

describe('AudioUploadPageComponent', () => {
  let fixture: ComponentFixture<AudioUploadPageComponent>;
  let navigate: ReturnType<typeof vi.spyOn>;
  const startCompleteProcessing = vi.fn();
  const writeFailure = vi.fn();
  const show = vi.fn();
  const sessionState = {
    sessions: signal([]),
    sortedSessions: signal([]),
    createSessionDraft: vi.fn(() => ({ id: 's1' })),
    updateSession: vi.fn(),
  };

  function setup(language: 'nl' | 'en' = 'en'): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AudioSessionStateService, useValue: sessionState },
        { provide: AudioCompleteProcessingService, useValue: { startCompleteProcessing, writeFailure } },
        { provide: AuthService, useValue: { currentUser: signal({ uid: 'u1' }) } },
        { provide: CampaignContextService, useValue: { selectedCampaignId: signal('c1'), selectedCampaign: signal({ id: 'c1', name: 'Grauwhaven' }) } },
        { provide: ToastService, useValue: { show } },
        { provide: ScreenWakeLockService, useValue: { supported: true, hold: () => () => undefined } },
        provideTestLanguage(language),
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(AudioUploadPageComponent);
    fixture.detectChanges();
  }

  const upload = (sessionName = '') =>
    fixture.componentInstance.startCompleteProcessing({
      files: [new File(['x'], 'evening-1.wav')],
      sessionName,
      sessionDate: '2026-10-27',
      userId: 'u1',
      campaignId: 'c1',
    });

  beforeEach(() => {
    vi.clearAllMocks();
    startCompleteProcessing.mockResolvedValue({ sessionId: 's1' });
    writeFailure.mockResolvedValue(undefined);
  });

  it.each([
    ['en', en.audio.untitledSession],
    ['nl', nl.audio.untitledSession],
  ] as const)('names a session without a name in the active language (%s)', async (language, sessionTitle) => {
    setup(language);
    await upload();
    expect(startCompleteProcessing).toHaveBeenCalledWith('c1', 's1', expect.any(Array), { sessionTitle, sessionDate: '2026-10-27' });
  });

  it('goes to the new session in its campaign right away', async () => {
    setup();
    await upload();
    expect(navigate).toHaveBeenCalledWith(['/campaign', 'c1', 'sessions', 's1']);
  });

  it('leads back to the sessions of the campaign', () => {
    setup();
    const back = (fixture.nativeElement as HTMLElement).querySelector('a.qm-backlink');
    expect(back?.getAttribute('href')).toBe('/campaign/c1/sessions');
    expect(back?.textContent).toContain('Grauwhaven');
  });

  it('keeps writing the English progress message for older clients', async () => {
    setup('nl');
    await upload('The Goblin Warrens');
    expect(sessionState.updateSession).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ progress: expect.objectContaining({ stage: 'compressing', message: 'Preparing upload...' }) })
    );
  });

  it('tells the user in their language that a file failed, and stores the raw error', async () => {
    setup('nl');
    startCompleteProcessing.mockRejectedValue(new Error('Not a RIFF/WAVE file'));

    await upload();
    await vi.waitFor(() => expect(writeFailure).toHaveBeenCalled());

    expect(show).toHaveBeenCalledWith(nl.audio.upload.failed, 'error', 6000);
    expect(writeFailure).toHaveBeenCalledWith('c1', 's1', 'Not a RIFF/WAVE file');
  });

  it('gives the text of the reason when the backend refuses the upload', async () => {
    setup();
    startCompleteProcessing.mockRejectedValue(
      Object.assign(new Error('No uploaded audio found for this session'), {
        code: 'functions/failed-precondition',
        details: { reason: 'no-uploaded-audio' },
      })
    );

    await upload();
    await vi.waitFor(() => expect(writeFailure).toHaveBeenCalled());

    expect(show).toHaveBeenCalledWith(en.errors.reasons.noUploadedAudio, 'error', 6000);
    expect(writeFailure).toHaveBeenCalledWith('c1', 's1', 'No uploaded audio found for this session');
  });
});
