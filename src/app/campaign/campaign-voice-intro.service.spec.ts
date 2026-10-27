import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { CampaignVoiceIntroService } from './campaign-voice-intro.service';
import { FirebaseService } from '../core/firebase.service';
import { AuthService } from '../auth/auth.service';
import { CampaignService } from './campaign.service';

describe('CampaignVoiceIntroService', () => {
  let service: CampaignVoiceIntroService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: FirebaseService, useValue: { storage: null } },
        { provide: AuthService, useValue: { currentUser: () => ({ uid: 'user-1' }) } },
        { provide: CampaignService, useValue: {} }
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
    expect(service.validateFile(file)).toContain('Unsupported file type');
  });

  it('rejects files that are too large', () => {
    const file = new File(['audio'], 'intro.m4a', { type: 'audio/mp4' });
    Object.defineProperty(file, 'size', { value: 101 * 1024 * 1024 });
    expect(service.validateFile(file)).toContain('too large');
  });

  it('allows larger WAV files, since they are compressed in the browser', () => {
    const wav = new File(['audio'], 'intro.wav', { type: 'audio/wav' });
    Object.defineProperty(wav, 'size', { value: 200 * 1024 * 1024 });
    expect(service.validateFile(wav)).toBeNull();

    const huge = new File(['audio'], 'intro.wav', { type: 'audio/wav' });
    Object.defineProperty(huge, 'size', { value: 501 * 1024 * 1024 });
    expect(service.validateFile(huge)).toContain('too large');
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
});
