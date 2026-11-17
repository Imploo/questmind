import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { CampaignVoiceIntroService } from './campaign-voice-intro.service';
import { FirebaseService } from '../core/firebase.service';
import { AuthService } from '../auth/auth.service';
import { CampaignService } from './campaign.service';
import { CampaignError } from './campaign-error';
import { I18nService } from '../core/i18n/i18n.service';
import { provideTestLanguage } from '../core/i18n/testing';
import { en } from '../core/i18n/en';
import { nl } from '../core/i18n/nl';

describe('CampaignVoiceIntroService', () => {
  let service: CampaignVoiceIntroService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: FirebaseService, useValue: { storage: null } },
        { provide: AuthService, useValue: { currentUser: () => ({ uid: 'user-1' }) } },
        { provide: CampaignService, useValue: {} },
        provideTestLanguage('en')
      ]
    });
    service = TestBed.inject(CampaignVoiceIntroService);
  });

  it('accepts audio files', () => {
    const file = new File(['audio'], 'intro.mp3', { type: 'audio/mpeg' });
    expect(service.validateFile(file)).toBeNull();
  });

  it('rejects non-audio files', () => {
    const file = new File(['text'], 'intro.txt', { type: 'text/plain' });
    expect(service.validateFile(file)).toBe(en.campaign.voiceIntro.unsupportedFileType);
  });

  it('rejects files that are too large', () => {
    const file = new File(['audio'], 'intro.m4a', { type: 'audio/mp4' });
    Object.defineProperty(file, 'size', { value: 101 * 1024 * 1024 });
    expect(service.validateFile(file)).toBe(en.campaign.voiceIntro.fileTooLarge(100));
  });

  it('allows larger WAV files, since they are compressed in the browser', () => {
    const wav = new File(['audio'], 'intro.wav', { type: 'audio/wav' });
    Object.defineProperty(wav, 'size', { value: 200 * 1024 * 1024 });
    expect(service.validateFile(wav)).toBeNull();

    const huge = new File(['audio'], 'intro.wav', { type: 'audio/wav' });
    Object.defineProperty(huge, 'size', { value: 501 * 1024 * 1024 });
    expect(service.validateFile(huge)).toBe(en.campaign.voiceIntro.wavTooLarge(500));
  });

  it('accepts audio files the browser reports without a MIME type', () => {
    expect(service.validateFile(new File(['audio'], 'TX01.m4a', { type: '' }))).toBeNull();
  });

  it('fails clearly when Storage is not configured', async () => {
    const file = new File(['audio'], 'intro.mp3', { type: 'audio/mpeg' });
    await expect(service.upload('campaign-1', file, () => undefined)).rejects.toThrow(
      'Firebase Storage is not configured.'
    );
  });

  it('gives the message in the language active at that moment', () => {
    const file = new File(['text'], 'intro.txt', { type: 'text/plain' });
    TestBed.inject(I18nService).use('nl');

    expect(service.validateFile(file)).toBe(nl.campaign.voiceIntro.unsupportedFileType);
  });

  it('refuses an unusable file on upload with a message that may be shown', async () => {
    const file = new File(['text'], 'intro.txt', { type: 'text/plain' });

    const error = await service.upload('campaign-1', file, () => undefined).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CampaignError);
    expect((error as Error).message).toBe(en.campaign.voiceIntro.unsupportedFileType);
  });
});
