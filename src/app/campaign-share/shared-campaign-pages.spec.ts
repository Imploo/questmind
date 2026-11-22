import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { CampaignShareService } from './campaign-share.service';
import { SharedCampaignStore } from './shared-campaign.store';
import { SharedCampaignPageComponent } from './shared-campaign-page.component';
import { SharedCampaignStoryComponent } from './shared-campaign-story.component';
import { SharedCampaignSessionsComponent } from './shared-campaign-sessions.component';
import { SharedCampaignPodcastsComponent } from './shared-campaign-podcasts.component';
import { SharedSessionPageComponent } from './shared-session-page.component';
import type { SharedCampaign } from './campaign-share.models';
import { PodcastDeleteService } from '../audio/services/podcast-delete.service';
import { provideTestLanguage } from '../core/i18n/testing';
import { nl } from '../core/i18n/nl';

const podcast = { version: 2, status: 'completed' as const, audioUrl: 'https://audio/p2.mp3', duration: 300, fileSize: 1000, createdAt: '2026-10-21T10:00:00.000Z' };

const campaign: SharedCampaign = {
  name: 'Ansalon',
  playerCount: 7,
  sessionCount: 3,
  lastPlayed: '2026-10-20',
  story: {
    version: 3,
    title: 'De zoektocht naar de Dragonlance',
    content: 'Het **begon** in Solace.',
    completedAt: '2026-11-22T01:28:00.000Z',
    sourceSessions: [{ sessionId: 's1', title: 'De draak', sessionDate: '2026-10-20', storyVersion: 1 }],
    sourceJournals: [],
    editedAt: null,
    podcasts: [podcast],
  },
  sessions: [
    { id: 's3', title: 'De draak', sessionDate: '2026-10-20', content: '## Titel\nDe draak <script>x</script> ontwaakt.', podcasts: [podcast] },
    { id: 's2', title: '', sessionDate: '2026-10-01', content: 'Het midden.', podcasts: [] },
    { id: 's1', title: 'Begin', sessionDate: null, content: 'Het begin.', podcasts: [] },
  ],
};

describe('shared campaign pages', () => {
  const getSharedCampaign = vi.fn();
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  async function render<T>(component: Type<T>, routeParams: Record<string, string>): Promise<HTMLElement> {
    params = new BehaviorSubject(convertToParamMap(routeParams));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestLanguage('nl'),
        SharedCampaignStore,
        { provide: CampaignShareService, useValue: { getSharedCampaign } },
        { provide: PodcastDeleteService, useValue: {} },
        { provide: ActivatedRoute, useValue: { paramMap: params, snapshot: { pathFromRoot: [{ paramMap: convertToParamMap({ shareId: 'abc' }) }] } } },
      ],
    });
    // The tab pages read what the campaign page loaded.
    TestBed.inject(SharedCampaignStore).select('abc');
    const fixture = TestBed.createComponent(component);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    getSharedCampaign.mockResolvedValue(campaign);
  });

  it('shows the campaign read-only, with the same heading and tabs as the campaign page', async () => {
    const element = await render(SharedCampaignPageComponent, {});

    expect(getSharedCampaign).toHaveBeenCalledWith('abc');
    expect(element.querySelector('h1')?.textContent).toBe('Ansalon');
    const facts = element.querySelector('[data-testid="campaign-facts"]')?.textContent ?? '';
    expect(facts).toContain(nl.campaign.page.sessions(3));
    expect(facts).toContain(nl.campaign.page.players(7));
    expect(Array.from(element.querySelectorAll('.campaign-tab')).map(tab => tab.getAttribute('href'))).toEqual([
      '/share/campaign/abc/story',
      '/share/campaign/abc/sessions',
      '/share/campaign/abc/podcasts',
    ]);
    // Nothing to change: no new session, no settings, no sharing.
    expect(element.querySelector('[data-testid="new-session"]')).toBeNull();
    expect(element.querySelector('[data-testid="share-campaign"]')).toBeNull();
  });

  it('says so when the link does not exist', async () => {
    getSharedCampaign.mockResolvedValue(null);
    const element = await render(SharedCampaignPageComponent, {});

    expect(element.querySelector('[data-testid="share-not-found"]')?.textContent).toContain(nl.campaign.sharePage.notFoundTitle);
    expect(element.querySelector('.campaign-tab')).toBeNull();
  });

  it('shows the story with its podcast, without edit buttons', async () => {
    const element = await render(SharedCampaignStoryComponent, {});

    expect(element.textContent).toContain('De zoektocht naar de Dragonlance');
    expect(element.querySelector('[data-testid="story-status"]')?.textContent).toContain(nl.campaignStory.coversUntil('20 okt 2026'));
    expect(element.querySelectorAll('app-podcast-version-item')).toHaveLength(1);
    expect(element.querySelector('[data-testid="edit-story"]')).toBeNull();
    expect(element.querySelector('[data-testid="generate-story"]')).toBeNull();
    expect(element.querySelector('app-podcast-share-button')).toBeNull();
    expect(element.querySelector('[data-testid="podcast-delete"]')).toBeNull();
  });

  it('lists the sessions, leading to their shared pages', async () => {
    const element = await render(SharedCampaignSessionsComponent, {});

    const rows = Array.from(element.querySelectorAll('[data-testid="session-row"]'));
    expect(rows.map(row => row.getAttribute('href'))).toEqual([
      '/share/campaign/abc/sessions/s3',
      '/share/campaign/abc/sessions/s2',
      '/share/campaign/abc/sessions/s1',
    ]);
    expect(rows[1].textContent).toContain(nl.audio.untitledSession);
    expect(rows[0].textContent).toContain('ontwaakt.');
    expect(rows[0].textContent).not.toContain('Titel');
  });

  it('lists the podcasts to play and download, not to share or delete', async () => {
    const element = await render(SharedCampaignPodcastsComponent, {});

    expect(element.querySelectorAll('app-podcast-version-item')).toHaveLength(1);
    expect(element.querySelector('a[download]')?.getAttribute('href')).toBe('https://audio/p2.mp3');
    expect(element.querySelector('app-podcast-share-button')).toBeNull();
  });

  it('shows a session read-only, with the way to the sessions beside it', async () => {
    const element = await render(SharedSessionPageComponent, { sessionId: 's2' });

    expect(element.querySelector('h1')?.textContent).toBe(nl.audio.defaultStoryTitle);
    expect(element.querySelector('[data-testid="session-story"]')?.textContent).toContain('Het midden.');
    expect(element.querySelector('[data-testid="previous-session"]')?.getAttribute('href')).toBe('/share/campaign/abc/sessions/s1');
    expect(element.querySelector('[data-testid="next-session"]')?.getAttribute('href')).toBe('/share/campaign/abc/sessions/s3');
    expect(element.querySelector('textarea, input')).toBeNull();
  });

  it('renders a session story safely', async () => {
    const element = await render(SharedSessionPageComponent, { sessionId: 's3' });

    expect(element.querySelector('[data-testid="session-story"] h2')?.textContent).toBe('Titel');
    expect(element.querySelector('[data-testid="session-story"] script')).toBeNull();
    expect(element.querySelectorAll('app-podcast-version-item')).toHaveLength(1);
  });

  it('says so for a session that is not in the shared campaign', async () => {
    const element = await render(SharedSessionPageComponent, { sessionId: 'nope' });

    expect(element.querySelector('[data-testid="session-not-found"]')?.textContent).toContain(nl.campaign.sharePage.sessionNotFound);
  });
});
