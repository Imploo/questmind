import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import type { User } from 'firebase/auth';
import { CampaignContextService } from './campaign-context.service';
import { CampaignService } from './campaign.service';
import { CampaignError } from './campaign-error';
import { Campaign, UserProfile } from './campaign.models';
import { AuthService } from '../auth/auth.service';
import { UserService } from '../core/user.service';
import { I18nService } from '../core/i18n/i18n.service';
import { provideTestLanguage } from '../core/i18n/testing';
import { en } from '../core/i18n/en';
import { nl } from '../core/i18n/nl';

describe('CampaignContextService', () => {
  const currentUser = signal<User | null>(null);
  const storedProfile = signal<UserProfile | null | undefined>(undefined);
  const campaignService = { createCampaign: vi.fn(), getCampaignsByIds: vi.fn() };
  const userService = { storedProfile, ensureProfile: vi.fn(), setDefaultCampaign: vi.fn() };

  const user = (overrides: Partial<User>) => ({ uid: 'u1', displayName: null, email: null, ...overrides }) as User;
  const profile = (campaigns: string[]) => ({ uid: 'u1', campaigns }) as unknown as UserProfile;
  const campaign = (id: string) => ({ id, name: id }) as Campaign;

  function setup(language: 'nl' | 'en' = 'en'): CampaignContextService {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { currentUser } },
        { provide: CampaignService, useValue: campaignService },
        { provide: UserService, useValue: userService },
        provideTestLanguage(language),
      ],
    });
    return TestBed.inject(CampaignContextService);
  }

  /** Let the effects run and the loading they start finish. */
  async function settle(): Promise<void> {
    TestBed.tick();
    await new Promise(resolve => setTimeout(resolve));
    TestBed.tick();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    currentUser.set(null);
    storedProfile.set(undefined);
    campaignService.createCampaign.mockResolvedValue('new-campaign');
    campaignService.getCampaignsByIds.mockImplementation((ids: string[]) => Promise.resolve(ids.map(campaign)));
    userService.setDefaultCampaign.mockResolvedValue(undefined);
  });

  describe('the first campaign of a new user', () => {
    it('is named after the user', async () => {
      currentUser.set(user({ displayName: 'Matt' }));
      storedProfile.set(profile([]));
      const service = setup();
      await settle();

      expect(campaignService.createCampaign).toHaveBeenCalledWith(en.campaign.defaultName('Matt'));
      expect(campaignService.createCampaign).toHaveBeenCalledWith('Matt Campaign');
      expect(service.selectedCampaignId()).toBe('new-campaign');
    });

    it('is written in Dutch for a Dutch user', async () => {
      currentUser.set(user({ displayName: 'Matt' }));
      storedProfile.set(profile([]));
      setup('nl');
      await settle();

      expect(campaignService.createCampaign).toHaveBeenCalledWith('Campagne van Matt');
    });

    it('falls back on the e-mail address, and on a text of its own without either', async () => {
      currentUser.set(user({ email: 'matt@example.com' }));
      storedProfile.set(profile([]));
      setup('nl');
      await settle();
      expect(campaignService.createCampaign).toHaveBeenLastCalledWith('Campagne van matt@example.com');

      expect(nl.campaign.defaultName('')).toBe('Mijn campagne');
      expect(en.campaign.defaultName('')).toBe('My Campaign');
    });

    it('is made once: switching language afterwards does not load or create again', async () => {
      currentUser.set(user({ displayName: 'Matt' }));
      storedProfile.set(profile([]));
      setup();
      await settle();
      expect(campaignService.createCampaign).toHaveBeenCalledTimes(1);

      TestBed.inject(I18nService).use('nl');
      await settle();

      expect(campaignService.createCampaign).toHaveBeenCalledTimes(1);
    });

    it('replaces campaigns that can no longer be loaded', async () => {
      currentUser.set(user({ displayName: 'Matt' }));
      storedProfile.set(profile(['gone']));
      campaignService.getCampaignsByIds.mockImplementation((ids: string[]) =>
        Promise.resolve(ids.includes('gone') ? [] : ids.map(campaign))
      );
      setup('nl');
      await settle();

      expect(campaignService.createCampaign).toHaveBeenCalledWith(nl.campaign.defaultName('Matt'));
    });
  });

  describe('when loading fails', () => {
    beforeEach(() => {
      currentUser.set(user({ displayName: 'Matt' }));
      storedProfile.set(profile(['c1']));
    });

    it('shows a translated text instead of the raw error', async () => {
      campaignService.getCampaignsByIds.mockRejectedValue(new Error('5 NOT_FOUND: database missing'));
      const service = setup('nl');
      await settle();

      expect(service.error()).toBe(nl.campaign.errors.loadFailed);
      expect(service.isLoading()).toBe(false);
    });

    it('shows the rights message when Firestore refuses', async () => {
      campaignService.getCampaignsByIds.mockRejectedValue(
        Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })
      );
      const service = setup();
      await settle();

      expect(service.error()).toBe(en.errors.permissionDenied);
    });

    it('shows a refusal of the campaign service as it is', async () => {
      storedProfile.set(profile([]));
      campaignService.createCampaign.mockRejectedValue(new CampaignError(en.campaign.errors.notConfigured));
      const service = setup();
      await settle();

      expect(service.error()).toBe(en.campaign.errors.notConfigured);
    });
  });
});
