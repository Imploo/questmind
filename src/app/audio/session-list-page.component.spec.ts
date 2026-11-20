import { describe, it, expect, beforeEach } from 'vitest';
import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionListPageComponent } from './session-list-page.component';
import { AudioSessionStateService } from './services/audio-session-state.service';
import { AuthService } from '../auth/auth.service';
import { CampaignContextService } from '../campaign/campaign-context.service';
import { CampaignStoryService } from '../campaign-story/campaign-story.service';
import { CampaignStoryVersion } from '../campaign-story/campaign-story.models';
import { provideTestLanguage } from '../core/i18n/testing';
import { nl } from '../core/i18n/nl';

type Session = Record<string, unknown> & { id: string };

describe('SessionListPageComponent', () => {
  let fixture: ComponentFixture<SessionListPageComponent>;
  let element: HTMLElement;

  const sessions = signal<Session[]>([]);
  const versions = signal<CampaignStoryVersion[]>([]);
  const currentUser = signal<{ uid: string } | null>({ uid: 'owner' });

  const session = (id: string, overrides: Record<string, unknown> = {}): Session => ({
    id,
    title: `Sessie ${id}`,
    status: 'completed',
    content: '## Kop\n\nHet **gezelschap** kwam bij de [molen](https://example.com).\n\nDaarna meer.',
    sessionDate: '2026-11-14',
    ownerId: 'owner',
    ...overrides,
  });

  const rows = () => Array.from(element.querySelectorAll('[data-testid="session-row"]')) as HTMLAnchorElement[];
  const note = () => element.querySelector('[data-testid="story-note"]') as HTMLElement | null;

  function create(): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestLanguage('nl'),
        { provide: AuthService, useValue: { currentUser } },
        {
          provide: CampaignContextService,
          useValue: {
            selectedCampaignId: signal('c1'),
            selectedCampaign: signal({ id: 'c1', name: 'Grauwhaven', ownerId: 'owner' }),
          },
        },
        { provide: AudioSessionStateService, useValue: { sessions, sortedSessions: sessions } },
        { provide: CampaignStoryService, useValue: { versions, isLoading: signal(false) } },
      ],
    });
    fixture = TestBed.createComponent(SessionListPageComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  beforeEach(() => {
    sessions.set([]);
    versions.set([]);
    currentUser.set({ uid: 'owner' });
  });

  it('lists each session with its day, its title and the first line of its story', () => {
    sessions.set([session('a')]);
    create();

    const row = rows()[0];
    expect(row.getAttribute('href')).toBe('/campaign/c1/sessions/a');
    expect(row.querySelector('.session-day-number')?.textContent).toBe('14');
    expect(row.querySelector('.session-day-month')?.textContent).toBe('nov');
    expect(row.textContent).toContain('Sessie a');
    expect(row.textContent).toContain('Het gezelschap kwam bij de molen.');
    expect(row.textContent).toContain(nl.audio.list.you);
  });

  it('shows how far a session that is being processed is', () => {
    sessions.set([
      session('b', {
        status: 'processing',
        content: '',
        progress: { stage: 'transcribing', progress: 42, message: '', startedAt: new Date(), updatedAt: new Date() },
      }),
    ]);
    create();

    expect(rows()[0].classList).toContain('is-busy');
    expect(rows()[0].textContent).toContain(`${nl.progress.stages.transcribing} · 42%`);
  });

  it('invites the first upload when there are no sessions', () => {
    create();
    expect(rows()).toHaveLength(0);
    expect(element.textContent).toContain(nl.audio.list.emptyTitle);
    expect(element.querySelector('a.qm-btn-primary')?.getAttribute('href')).toBe('/campaign/c1/sessions/new');
  });

  describe('the note about the campaign story', () => {
    const story = (): CampaignStoryVersion => ({
      id: 'v1',
      version: 1,
      status: 'completed',
      title: 'Verhaal',
      content: '...',
      sourceSessions: [{ sessionId: 'a', title: 'A', sessionDate: '2026-10-24', storyVersion: 1 }],
      skippedSessions: [],
      createdBy: 'owner',
      createdAt: new Date(),
    });

    it('tells the owner how far the story runs and how many sessions are missing', () => {
      versions.set([story()]);
      sessions.set([session('b'), session('a')]);
      create();

      expect(note()?.textContent).toContain(nl.campaignStory.coversUntil('24 okt 2026'));
      expect(note()?.textContent).toContain(nl.campaignStory.changedSessions(1));
      expect(note()?.querySelector('a')?.getAttribute('href')).toBe('/campaign/c1/story');
    });

    it('is left out when every session is in the story', () => {
      versions.set([story()]);
      sessions.set([session('a')]);
      create();
      expect(note()).toBeNull();
    });

    it('offers to write the first story', () => {
      sessions.set([session('a'), session('b')]);
      create();
      expect(note()?.textContent).toContain(nl.campaignStory.readySessions(2));
      expect(note()?.textContent).toContain(nl.campaignStory.write);
    });

    it('does not bother a member with it', () => {
      currentUser.set({ uid: 'member' });
      sessions.set([session('a')]);
      create();
      expect(note()).toBeNull();
    });
  });
});
