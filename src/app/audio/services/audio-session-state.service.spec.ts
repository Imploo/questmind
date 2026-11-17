import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AudioSessionStateService } from './audio-session-state.service';
import { AuthService } from '../../auth/auth.service';
import { CampaignContextService } from '../../campaign/campaign-context.service';
import { AudioSessionRepositoryFactory } from '../../shared/repository/audio-session.repository';
import { en } from '../../core/i18n/en';
import { nl } from '../../core/i18n/nl';
import { provideTestLanguage } from '../../core/i18n/testing';

describe('AudioSessionStateService', () => {
  const update = vi.fn();
  const repo = { waitForData: () => Promise.resolve(), get: () => [], update, destroy: vi.fn() };

  async function setup(language: 'nl' | 'en'): Promise<AudioSessionStateService> {
    TestBed.configureTestingModule({
      providers: [
        provideTestLanguage(language),
        { provide: AuthService, useValue: { currentUser: signal({ uid: 'u1', email: 'owner@example.com' }) } },
        { provide: CampaignContextService, useValue: { selectedCampaignId: signal('c1') } },
        { provide: AudioSessionRepositoryFactory, useValue: { create: () => repo } },
      ],
    });
    const service = TestBed.inject(AudioSessionStateService);
    // The repository arrives through a resource: wait until it is there.
    service.sessions();
    await TestBed.inject(ApplicationRef).whenStable();
    return service;
  }

  const upload = (sessionName?: string) => ({
    file: new File(['x'], 'evening-1.wav'),
    sessionName,
    sessionDate: '2026-10-27',
    userId: 'u1',
    campaignId: 'c1',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    update.mockResolvedValue(undefined);
  });

  it.each([
    ['en', en.audio.defaultSessionTitle('evening-1')],
    ['nl', nl.audio.defaultSessionTitle('evening-1')],
  ] as const)('stores a session without a name under a default title in the active language (%s)', async (language, title) => {
    const service = await setup(language);

    const draft = service.createSessionDraft(upload());

    expect(draft.title).toBe(title);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ title, audioFileName: 'evening-1.wav' }));
  });

  it('keeps the name the user gave', async () => {
    const service = await setup('nl');
    expect(service.createSessionDraft(upload('  The Goblin Warrens ')).title).toBe('The Goblin Warrens');
  });
});
