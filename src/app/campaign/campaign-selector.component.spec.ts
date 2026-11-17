import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { BookOpen, ChevronDown, LUCIDE_ICONS, LucideIconProvider, Plus, Settings } from 'lucide-angular';
import { CampaignSelectorComponent } from './campaign-selector.component';
import { CampaignService } from './campaign.service';
import { CampaignContextService } from './campaign-context.service';
import { CampaignError } from './campaign-error';
import { Campaign } from './campaign.models';
import { AuthService } from '../auth/auth.service';
import { I18nService } from '../core/i18n/i18n.service';
import { provideTestLanguage } from '../core/i18n/testing';
import { en } from '../core/i18n/en';
import { nl } from '../core/i18n/nl';

describe('CampaignSelectorComponent', () => {
  let fixture: ComponentFixture<CampaignSelectorComponent>;
  let component: CampaignSelectorComponent;
  let element: HTMLElement;

  const campaign = { id: 'campaign-1', name: 'Grauwhaven', ownerId: 'owner' } as Campaign;
  const campaigns = signal<Campaign[]>([]);
  const selectedCampaign = signal<Campaign | null>(null);
  const campaignService = {
    createCampaign: vi.fn(),
    isCampaignOwner: (c: Campaign, userId: string | null | undefined) => c.ownerId === userId,
  };
  const campaignContext = {
    campaigns,
    selectedCampaign,
    selectedCampaignId: signal<string | null>(null),
    selectCampaign: vi.fn(),
    refreshCampaigns: vi.fn(),
  };
  const router = { navigate: vi.fn() };

  const text = () => element.textContent ?? '';

  function create(language: 'nl' | 'en' = 'en'): void {
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: AuthService, useValue: { currentUser: signal({ uid: 'owner' }) } },
        { provide: CampaignService, useValue: campaignService },
        { provide: CampaignContextService, useValue: campaignContext },
        {
          provide: LUCIDE_ICONS,
          multi: true,
          useValue: new LucideIconProvider({ BookOpen, ChevronDown, Plus, Settings }),
        },
        provideTestLanguage(language),
      ],
    });
    fixture = TestBed.createComponent(CampaignSelectorComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    campaigns.set([]);
    selectedCampaign.set(null);
    router.navigate.mockResolvedValue(true);
    campaignContext.refreshCampaigns.mockResolvedValue(undefined);
  });

  it('asks to select a campaign while none is selected', () => {
    create();

    expect(text()).toContain(en.campaign.selector.select);
    expect(element.querySelector('button[disabled]')?.getAttribute('aria-label')).toBe(en.campaign.settings.title);
  });

  it('shows the name of the selected campaign as the user wrote it', () => {
    selectedCampaign.set(campaign);
    create('nl');

    expect(text()).toContain('Grauwhaven');
    expect(text()).not.toContain(nl.campaign.selector.select);
  });

  it('lists the campaigns with a translated owner badge, and switches language while open', () => {
    campaigns.set([campaign]);
    create();
    component.toggleDropdown();
    fixture.detectChanges();

    expect(text()).toContain(en.campaign.selector.campaigns);
    expect(text()).toContain(en.campaign.roles.owner);
    expect(text()).toContain(en.campaign.selector.newCampaign);

    TestBed.inject(I18nService).use('nl');
    fixture.detectChanges();

    expect(text()).toContain(nl.campaign.selector.campaigns);
    expect(text()).toContain(nl.campaign.roles.owner);
    expect(text()).toContain(nl.campaign.selector.newCampaign);
  });

  it('says so when there are no campaigns', () => {
    create('nl');
    component.toggleDropdown();
    fixture.detectChanges();

    expect(text()).toContain(nl.campaign.selector.empty);
  });

  it('translates the dialog for a new campaign, placeholders included', () => {
    create('nl');
    component.showCreateCampaign.set(true);
    fixture.detectChanges();

    expect(element.querySelector('#create-campaign-title')?.textContent).toBe(nl.campaign.selector.createTitle);
    expect((element.querySelector('#new-campaign-name') as HTMLInputElement).placeholder).toBe(
      nl.campaign.selector.namePlaceholder
    );
    expect((element.querySelector('#new-campaign-description') as HTMLTextAreaElement).placeholder).toBe(
      nl.campaign.selector.descriptionPlaceholder
    );
    expect(text()).toContain(nl.campaign.selector.descriptionLabel);
    expect(text()).toContain(nl.common.create);
    expect(text()).toContain(nl.common.cancel);
  });

  describe('when creating a campaign fails', () => {
    it('shows the reason the service gives', async () => {
      campaignService.createCampaign.mockRejectedValue(new CampaignError(en.errors.unauthenticated));
      create();

      await component.createCampaign();

      expect(component.errorMessage()).toBe(en.errors.unauthenticated);
    });

    it('shows a translated text instead of a raw Firebase message', async () => {
      campaignService.createCampaign.mockRejectedValue(new Error('Missing or insufficient permissions.'));
      create('nl');

      await component.createCampaign();

      expect(component.errorMessage()).toBe(nl.campaign.errors.createFailed);
    });
  });
});
