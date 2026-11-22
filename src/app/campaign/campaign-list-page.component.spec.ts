import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { CampaignListPageComponent } from './campaign-list-page.component';
import { CampaignContextService } from './campaign-context.service';
import { CampaignService } from './campaign.service';
import { CampaignSummaryService } from './campaign-summary.service';
import { AuthService } from '../auth/auth.service';
import { provideTestLanguage } from '../core/i18n/testing';
import { nl } from '../core/i18n/nl';

describe('CampaignListPageComponent', () => {
  let fixture: ComponentFixture<CampaignListPageComponent>;
  let element: HTMLElement;

  const campaigns = signal([
    { id: 'c1', name: 'De Asgrauwe Kroon', description: 'Een kroon zonder drager.', ownerId: 'u1', members: { u1: {}, u2: {} } },
    { id: 'c2', name: 'Schaduwen over Veldmark', ownerId: 'u9', members: { u1: {}, u9: {} } },
  ]);
  const summary = vi.fn();
  const createCampaign = vi.fn();
  const refreshCampaigns = vi.fn();

  const cards = () => Array.from(element.querySelectorAll('[data-testid="campaign-card"]')) as HTMLAnchorElement[];

  beforeEach(async () => {
    vi.clearAllMocks();
    summary.mockImplementation(async (id: string) =>
      id === 'c1'
        ? { sessionCount: 12, lastPlayed: '2026-11-20', processingCount: 1 }
        : { sessionCount: 0, lastPlayed: null, processingCount: 0 }
    );
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestLanguage('nl'),
        { provide: AuthService, useValue: { currentUser: signal({ uid: 'u1' }) } },
        {
          provide: CampaignContextService,
          useValue: { campaigns, isLoading: signal(false), refreshCampaigns },
        },
        {
          provide: CampaignService,
          useValue: { createCampaign, isCampaignOwner: (campaign: { ownerId: string }, uid: string) => campaign.ownerId === uid },
        },
        { provide: CampaignSummaryService, useValue: { summary } },
      ],
    });
    fixture = TestBed.createComponent(CampaignListPageComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('shows each campaign as a card with your role and its facts', () => {
    expect(cards().map(card => card.getAttribute('href'))).toEqual(['/campaign/c1', '/campaign/c2']);

    const first = cards()[0].textContent ?? '';
    expect(first).toContain('De Asgrauwe Kroon');
    expect(first).toContain(nl.campaign.roles.owner);
    expect(first).toContain(nl.campaign.page.sessions(12));
    expect(first).toContain(nl.campaign.page.players(2));
    expect(first).toContain(nl.campaign.page.lastPlayed('20 nov 2026'));
    expect(first).toContain(nl.campaign.list.processing(1));

    const second = cards()[1].textContent ?? '';
    expect(second).toContain(nl.campaign.roles.member);
    expect(second).not.toContain('laatst gespeeld');
  });

  it('creates a campaign and opens it', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    createCampaign.mockResolvedValue('c3');

    (element.querySelector('header button') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    const name = element.querySelector('#new-campaign-name') as HTMLInputElement;
    name.value = 'Nieuwe wereld';
    name.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    (element.querySelector('form button[type="submit"]') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(createCampaign).toHaveBeenCalledWith('Nieuwe wereld', '');
    expect(refreshCampaigns).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/campaign', 'c3']);
  });
});
