import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { CampaignSettingsComponent } from './campaign-settings.component';
import { CampaignService } from './campaign.service';
import { CampaignContextService } from './campaign-context.service';
import { CampaignVoiceIntroService } from './campaign-voice-intro.service';
import { CampaignError } from './campaign-error';
import { Campaign } from './campaign.models';
import { AuthService } from '../auth/auth.service';
import { ToastService } from '../shared/services/toast.service';
import { I18nService } from '../core/i18n/i18n.service';
import { provideTestLanguage } from '../core/i18n/testing';
import { en } from '../core/i18n/en';
import { nl } from '../core/i18n/nl';

describe('CampaignSettingsComponent', () => {
  let fixture: ComponentFixture<CampaignSettingsComponent>;
  let component: CampaignSettingsComponent;
  let element: HTMLElement;

  const campaign: Campaign = {
    id: 'campaign-1',
    name: 'Grauwhaven',
    createdAt: '',
    updatedAt: '',
    ownerId: 'owner',
    ownerEmail: 'owner@example.com',
    members: {},
    settings: {
      allowMembersToCreateSessions: true,
      voiceIntro: {
        storagePath: 'campaigns/campaign-1/voice-intro/intro.mp3',
        fileName: 'intro.mp3',
        mimeType: 'audio/mpeg',
        sizeBytes: 1024,
        durationSec: 95,
        uploadedAt: '',
        uploadedBy: 'owner',
      },
    },
  };
  const members = [
    { userId: 'owner', role: 'owner', email: 'owner@example.com', joinedAt: '' },
    { userId: 'member-1', role: 'member', email: 'member@example.com', joinedAt: '' },
  ];

  const selectedCampaign = signal<Campaign | null>(campaign);
  const campaignService = {
    updateCampaign: vi.fn(),
    updateVoiceIntroRoster: vi.fn(),
    inviteUserByEmail: vi.fn(),
    removeMember: vi.fn(),
    getCampaignMembers: vi.fn(),
    isCampaignOwner: (c: Campaign, userId: string | null | undefined) => c.ownerId === userId,
  };
  const campaignContext = {
    selectedCampaign,
    selectedCampaignId: signal<string | null>('campaign-1'),
    refreshCampaigns: vi.fn(),
  };
  const voiceIntroService = { validateFile: vi.fn(), upload: vi.fn(), remove: vi.fn(), getPlaybackUrl: vi.fn() };
  const toast = { confirm: vi.fn() };

  const text = () => element.textContent ?? '';
  const buttonWith = (label: string) =>
    Array.from(element.querySelectorAll('button')).find(b => b.textContent?.trim() === label) as HTMLButtonElement;

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    selectedCampaign.set(campaign);
    campaignService.getCampaignMembers.mockResolvedValue(members);
    campaignService.updateCampaign.mockResolvedValue(undefined);
    campaignService.inviteUserByEmail.mockResolvedValue(undefined);
    campaignService.removeMember.mockResolvedValue(undefined);
    campaignContext.refreshCampaigns.mockResolvedValue(undefined);
    voiceIntroService.getPlaybackUrl.mockResolvedValue('https://example.com/intro.mp3');
    voiceIntroService.remove.mockResolvedValue(undefined);
    voiceIntroService.validateFile.mockReturnValue(null);

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: AuthService, useValue: { currentUser: signal({ uid: 'owner' }) } },
        { provide: CampaignService, useValue: campaignService },
        { provide: CampaignContextService, useValue: campaignContext },
        { provide: CampaignVoiceIntroService, useValue: voiceIntroService },
        { provide: ToastService, useValue: toast },
        provideTestLanguage('en'),
      ],
    });
    fixture = TestBed.createComponent(CampaignSettingsComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settle();
  });

  // The spies on the browser's own confirm dialog must not outlive a test.
  afterEach(() => vi.restoreAllMocks());

  it('shows the settings in English', () => {
    expect(text()).toContain(en.campaign.settings.title);
    expect(text()).toContain(en.campaign.settings.general);
    expect(text()).toContain(en.campaign.members.title(2));
    expect(text()).toContain(en.campaign.roles.owner);
    expect(text()).toContain(en.campaign.roles.member);
    expect(buttonWith(en.campaign.settings.save)).toBeTruthy();
  });

  it('switches everything to Dutch without a reload, except what the user wrote', () => {
    TestBed.inject(I18nService).use('nl');
    fixture.detectChanges();

    expect(text()).toContain(nl.campaign.settings.title);
    expect(text()).toContain(nl.campaign.members.title(2));
    expect(text()).toContain(nl.campaign.roles.member);
    expect(text()).toContain(nl.campaign.voiceIntro.title);
    expect(text()).toContain(nl.campaign.voiceRoster.label);
    expect(text()).not.toContain(en.campaign.settings.general);
    expect(text()).toContain('Grauwhaven');
  });

  it('says there is no campaign when none is selected', () => {
    selectedCampaign.set(null);
    fixture.detectChanges();

    expect(text()).toContain(en.campaign.settings.noCampaign);
  });

  describe('removing a member', () => {
    it('asks in a toast, in the active language, and never with the browser dialog', async () => {
      const nativeConfirm = vi.spyOn(window, 'confirm');
      toast.confirm.mockResolvedValue(false);
      TestBed.inject(I18nService).use('nl');

      await component.removeMember('member-1');

      expect(toast.confirm).toHaveBeenCalledWith(nl.campaign.members.removeConfirm);
      expect(nativeConfirm).not.toHaveBeenCalled();
    });

    it('leaves the member alone when the user cancels', async () => {
      toast.confirm.mockResolvedValue(false);

      await component.removeMember('member-1');

      expect(campaignService.removeMember).not.toHaveBeenCalled();
    });

    it('removes the member after confirmation', async () => {
      toast.confirm.mockResolvedValue(true);

      // The owner has no remove button, so the only one in the list belongs to the member.
      const removeButton = element.querySelector('li button') as HTMLButtonElement;
      expect(removeButton.textContent?.trim()).toBe(en.common.remove);
      removeButton.click();
      await settle();

      expect(toast.confirm).toHaveBeenCalledWith(en.campaign.members.removeConfirm);
      expect(campaignService.removeMember).toHaveBeenCalledWith('campaign-1', 'member-1');
    });

    it('shows why the service refused', async () => {
      toast.confirm.mockResolvedValue(true);
      campaignService.removeMember.mockRejectedValue(new CampaignError(en.campaign.errors.cannotRemoveOwner));

      await component.removeMember('owner');
      fixture.detectChanges();

      expect(element.querySelector('[role="alert"]')?.textContent).toContain(en.campaign.errors.cannotRemoveOwner);
    });
  });

  describe('removing the voice introduction', () => {
    it('asks in a toast and keeps the recording when the user cancels', async () => {
      const nativeConfirm = vi.spyOn(window, 'confirm');
      toast.confirm.mockResolvedValue(false);

      await component.removeVoiceIntro();

      expect(toast.confirm).toHaveBeenCalledWith(en.campaign.voiceIntro.removeConfirm);
      expect(nativeConfirm).not.toHaveBeenCalled();
      expect(voiceIntroService.remove).not.toHaveBeenCalled();
    });

    it('removes the recording after confirmation', async () => {
      toast.confirm.mockResolvedValue(true);

      await component.removeVoiceIntro();

      expect(voiceIntroService.remove).toHaveBeenCalledWith('campaign-1', campaign.settings?.voiceIntro);
    });

    it('shows a translated text when removing fails, not the raw error', async () => {
      toast.confirm.mockResolvedValue(true);
      voiceIntroService.remove.mockRejectedValue(new Error('storage/unknown: boom'));

      await component.removeVoiceIntro();

      expect(component.voiceIntroError()).toBe(en.campaign.voiceIntro.removeFailed);
    });
  });

  describe('inviting a member', () => {
    it('confirms the invitation in the active language', async () => {
      TestBed.inject(I18nService).use('nl');
      component.inviteEmail = 'new@example.com';

      await component.inviteMember();

      expect(campaignService.inviteUserByEmail).toHaveBeenCalledWith('campaign-1', 'new@example.com');
      expect(component.inviteSuccess()).toBe(nl.campaign.members.invited);
    });

    it('shows the reason the service gives', async () => {
      const reason = en.campaign.errors.userNotFound('new@example.com');
      campaignService.inviteUserByEmail.mockRejectedValue(new CampaignError(reason));

      await component.inviteMember();
      fixture.detectChanges();

      expect(element.querySelector('[role="alert"]')?.textContent).toContain(reason);
    });

    it('never shows a raw Firebase message', async () => {
      campaignService.inviteUserByEmail.mockRejectedValue(new Error('Missing or insufficient permissions.'));

      await component.inviteMember();

      expect(component.inviteError()).toBe(en.campaign.errors.inviteFailed);
    });

    it('explains a refusal by the security rules', async () => {
      campaignService.inviteUserByEmail.mockRejectedValue(
        Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })
      );

      await component.inviteMember();

      expect(component.inviteError()).toBe(en.errors.permissionDenied);
    });
  });

  describe('the voice introduction upload', () => {
    const file = new File(['audio'], 'intro.mp3', { type: 'audio/mpeg' });

    it('shows the validation message of the service', async () => {
      voiceIntroService.validateFile.mockReturnValue(en.campaign.voiceIntro.unsupportedFileType);

      await component.uploadVoiceIntro(file);

      expect(component.voiceIntroError()).toBe(en.campaign.voiceIntro.unsupportedFileType);
      expect(voiceIntroService.upload).not.toHaveBeenCalled();
    });

    it('translates the reason the backend refuses with', async () => {
      voiceIntroService.upload.mockRejectedValue(
        Object.assign(new Error('Voice intro is too long'), {
          code: 'functions/failed-precondition',
          details: { reason: 'voice-intro-too-long' },
        })
      );
      TestBed.inject(I18nService).use('nl');

      await component.uploadVoiceIntro(file);

      expect(component.voiceIntroError()).toBe(nl.errors.reasons.voiceIntroTooLong);
    });

    it('falls back on a general text for any other failure', async () => {
      voiceIntroService.upload.mockRejectedValue(new Error('Firebase Storage is not configured.'));

      await component.uploadVoiceIntro(file);

      expect(component.voiceIntroError()).toBe(en.campaign.voiceIntro.uploadFailed);
    });
  });

  it('shows a translated text when saving the settings fails', async () => {
    campaignService.updateCampaign.mockRejectedValue(new Error('5 NOT_FOUND'));

    await component.saveCampaignSettings();

    expect(component.saveError()).toBe(en.campaign.errors.saveFailed);
  });

  it('shows a translated text when saving the speaking order fails', async () => {
    campaignService.updateVoiceIntroRoster.mockRejectedValue(new Error('5 NOT_FOUND'));

    await component.saveVoiceIntroRoster('1. DM');

    expect(component.voiceRosterError()).toBe(en.campaign.voiceRoster.saveFailed);
  });
});
