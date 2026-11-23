import { describe, it, expect } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CampaignPageComponent } from './campaign-page.component';
import { CampaignContextService } from './campaign-context.service';
import { AudioSessionStateService } from '../audio/services/audio-session-state.service';
import { CampaignShareService } from '../campaign-share/campaign-share.service';
import { provideTestLanguage } from '../core/i18n/testing';
import { nl } from '../core/i18n/nl';

describe('CampaignPageComponent', () => {
  function create(): HTMLElement {
    const sessions = [
      { id: 'b', sessionDate: '2026-11-20' },
      { id: 'a', sessionDate: '2026-11-14' },
    ];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestLanguage('nl'),
        {
          provide: CampaignContextService,
          useValue: {
            selectedCampaignId: signal('c1'),
            selectedCampaign: signal({ id: 'c1', name: 'De Asgrauwe Kroon', members: { u1: {}, u2: {}, u3: {} } }),
          },
        },
        { provide: AudioSessionStateService, useValue: { sessions: signal(sessions), sortedSessions: signal(sessions) } },
        { provide: CampaignShareService, useValue: { createShareUrl: () => Promise.resolve('') } },
      ],
    });
    const fixture = TestBed.createComponent(CampaignPageComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('names the campaign with its sessions, players and last evening of play', () => {
    const element = create();
    expect(element.querySelector('h1')?.textContent).toBe('De Asgrauwe Kroon');
    const facts = element.querySelector('[data-testid="campaign-facts"]')?.textContent ?? '';
    expect(facts).toContain(nl.campaign.page.sessions(2));
    expect(facts).toContain(nl.campaign.page.players(3));
    expect(facts).toContain(nl.campaign.page.lastPlayed('20 nov 2026'));
  });

  it('has the story first among its tabs, and a new session one tap away', () => {
    const element = create();
    const tabs = Array.from(element.querySelectorAll('.campaign-tab')) as HTMLAnchorElement[];
    expect(tabs.map(tab => tab.getAttribute('href'))).toEqual([
      '/campaign/c1/story',
      '/campaign/c1/sessions',
      '/campaign/c1/podcasts',
    ]);
    expect(tabs[0].textContent).toContain(nl.campaign.page.tabs.story);
    expect(element.querySelector('[data-testid="new-session"]')?.getAttribute('href')).toBe('/campaign/c1/sessions/new');
    expect(element.querySelector('a.qm-backlink')?.getAttribute('href')).toBe('/campaigns');
  });

  it('shares the campaign from between the new session and the settings, all three equally tall', () => {
    const element = create();
    const actions = element.querySelector('[data-testid="new-session"]')?.parentElement as HTMLElement;
    const order = Array.from(actions.children).map(child =>
      child.getAttribute('data-testid') ?? child.querySelector('[data-testid]')?.getAttribute('data-testid'));
    expect(order).toEqual(['new-session', 'share-campaign', 'campaign-settings']);
    expect(actions.classList).toContain('items-stretch');
    for (const id of order) {
      expect(element.querySelector(`[data-testid="${id}"]`)?.classList).toContain('qm-btn-lg');
    }
    expect(element.querySelector('[data-testid="share-campaign"]')?.getAttribute('aria-label')).toBe(nl.campaign.share.button);
  });
});
