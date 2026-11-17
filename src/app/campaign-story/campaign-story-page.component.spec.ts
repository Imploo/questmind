import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { BookOpen, ChevronDown, LUCIDE_ICONS, LucideIconProvider, Plus, Settings } from 'lucide-angular';
import { CampaignStoryPageComponent } from './campaign-story-page.component';
import { CampaignStoryService } from './campaign-story.service';
import { CampaignStoryVersion } from './campaign-story.models';
import { AuthService } from '../auth/auth.service';
import { CampaignService } from '../campaign/campaign.service';
import { CampaignContextService } from '../campaign/campaign-context.service';
import { AudioSessionStateService } from '../audio/services/audio-session-state.service';
import { I18nService } from '../core/i18n/i18n.service';
import { provideTestLanguage } from '../core/i18n/testing';
import { en } from '../core/i18n/en';
import { nl } from '../core/i18n/nl';

describe('CampaignStoryPageComponent', () => {
  let fixture: ComponentFixture<CampaignStoryPageComponent>;
  let element: HTMLElement;

  const versions = signal<CampaignStoryVersion[]>([]);
  const sessions = signal<{ id: string; status: string; content: string; storyRegenerationCount?: number }[]>([]);
  const currentUser = signal<{ uid: string } | null>({ uid: 'owner' });
  const storyService = {
    versions,
    isLoading: signal(false),
    generate: vi.fn(),
    generatePodcast: vi.fn(),
  };

  const version = (overrides: Partial<CampaignStoryVersion>): CampaignStoryVersion => ({
    id: `v${overrides.version ?? 1}`,
    version: 1,
    status: 'completed',
    title: 'De val van Grauwhaven',
    content: 'De party vertrok.',
    sourceSessions: [{ sessionId: 'a', title: 'A', sessionDate: null, storyVersion: 1 }],
    skippedSessions: [],
    createdBy: 'owner',
    createdAt: new Date(),
    ...overrides,
  });
  const session = (id: string) => ({ id, status: 'completed', content: 'Verhaal' });

  const text = () => element.textContent ?? '';
  const generateButton = () => element.querySelector('button.qm-btn-gold') as HTMLButtonElement;
  const alerts = () => Array.from(element.querySelectorAll('[role="alert"]')) as HTMLElement[];

  function create(language: 'nl' | 'en' = 'en'): void {
    TestBed.configureTestingModule({
      providers: [
        { provide: CampaignStoryService, useValue: storyService },
        { provide: AuthService, useValue: { currentUser } },
        {
          provide: CampaignContextService,
          useValue: {
            campaigns: signal([]),
            selectedCampaign: signal({ id: 'campaign-1', name: 'Grauwhaven', ownerId: 'owner' }),
            selectedCampaignId: signal('campaign-1'),
          },
        },
        { provide: AudioSessionStateService, useValue: { sessions } },
        // For the campaign selector at the top of the page.
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: CampaignService, useValue: { isCampaignOwner: () => true } },
        {
          provide: LUCIDE_ICONS,
          multi: true,
          useValue: new LucideIconProvider({ BookOpen, ChevronDown, Plus, Settings }),
        },
        provideTestLanguage(language),
      ],
    });
    fixture = TestBed.createComponent(CampaignStoryPageComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    versions.set([]);
    sessions.set([]);
    currentUser.set({ uid: 'owner' });
    storyService.generate.mockResolvedValue(undefined);
  });

  describe('while a version is being generated', () => {
    it('translates the step the backend is at, and ignores its own Dutch message', () => {
      versions.set([
        version({ version: 2, status: 'generating', progressStep: 'writing', progressMessage: 'Verhaal schrijven...' }),
      ]);
      create();

      expect(generateButton().textContent).toContain(en.campaignStory.progress.writing);
      expect(generateButton().textContent).not.toContain('Verhaal schrijven');
      expect(generateButton().disabled).toBe(true);
    });

    it('follows the step in Dutch for a Dutch user', () => {
      versions.set([version({ version: 2, status: 'generating', progressStep: 'collecting' })]);
      create('nl');

      expect(generateButton().textContent).toContain(nl.campaignStory.progress.collecting);
    });

    it('falls back on the status for a version without a step', () => {
      versions.set([version({ version: 2, status: 'generating', progressMessage: 'Sessieverhalen verzamelen...' })]);
      create();

      expect(generateButton().textContent).toContain(en.common.busy);
      expect(generateButton().textContent).not.toContain('Sessieverhalen');
    });
  });

  describe('when the newest version failed', () => {
    it('shows a translated message with the raw error collapsed under technical details', () => {
      versions.set([version({ version: 3, status: 'failed', error: 'Vertex AI: quota exceeded' }), version({})]);
      create();

      const alert = alerts()[0];
      expect(alert.textContent).toContain(en.campaignStory.versionFailed(3));
      const details = alert.querySelector('details') as HTMLDetailsElement;
      expect(details.open).toBe(false);
      expect(details.querySelector('summary')?.textContent).toContain(en.errors.technicalDetails);
      expect(details.querySelector('p')?.textContent).toBe('Vertex AI: quota exceeded');
    });

    it('leaves the details out when no error was stored', () => {
      versions.set([version({ version: 3, status: 'failed', error: null })]);
      create('nl');

      expect(alerts()[0].textContent).toContain(nl.campaignStory.versionFailed(3));
      expect(element.querySelector('details')).toBeNull();
    });

    it('does not bother a member with it', () => {
      currentUser.set({ uid: 'member' });
      versions.set([version({ version: 3, status: 'failed', error: 'boom' })]);
      create();

      expect(alerts()).toHaveLength(0);
    });
  });

  it('counts new and changed sessions in one sentence, singular and plural', () => {
    versions.set([version({})]);
    sessions.set([session('a'), session('b')]);
    create('nl');
    expect(text()).toContain(nl.campaignStory.changedSessions(1));

    sessions.set([session('a'), session('b'), session('c')]);
    fixture.detectChanges();
    expect(text()).toContain(nl.campaignStory.changedSessions(2));
  });

  it('explains an empty page to the owner and to a member', () => {
    create();
    expect(text()).toContain(en.campaignStory.emptyNoSessions);

    sessions.set([session('a')]);
    fixture.detectChanges();
    expect(text()).toContain(en.campaignStory.emptyOwner);

    currentUser.set({ uid: 'member' });
    fixture.detectChanges();
    expect(text()).toContain(en.campaignStory.emptyMember);
  });

  it('shows why a story could not be started', async () => {
    sessions.set([session('a')]);
    storyService.generate.mockRejectedValue(new Error(en.errors.reasons.storyAlreadyGenerating));
    create();

    generateButton().click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(storyService.generate).toHaveBeenCalledWith('campaign-1');
    expect(alerts()[0].textContent).toContain(en.errors.reasons.storyAlreadyGenerating);
  });

  it('switches to Dutch without a reload, and leaves the story itself alone', () => {
    versions.set([version({})]);
    create();
    expect(element.querySelector('h1')?.textContent).toBe(en.campaignStory.title);
    expect(text()).toContain(en.campaignStory.podcasts.empty);

    TestBed.inject(I18nService).use('nl');
    fixture.detectChanges();

    expect(element.querySelector('h1')?.textContent).toBe(nl.campaignStory.title);
    expect(text()).toContain(nl.campaignStory.intro);
    expect(text()).toContain(nl.campaignStory.generate);
    expect(text()).toContain(nl.campaignStory.podcasts.empty);
    expect(text()).toContain(nl.campaignStory.sessionCount(1));
    expect(text()).toContain('De val van Grauwhaven');
    expect(text()).toContain('De party vertrok.');
  });
});
