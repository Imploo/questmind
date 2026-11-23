import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { CampaignStoryPageComponent } from './campaign-story-page.component';
import { CampaignStoryService } from './campaign-story.service';
import { CampaignStoryVersion } from './campaign-story.models';
import { AuthService } from '../auth/auth.service';
import { CampaignContextService } from '../campaign/campaign-context.service';
import { AudioSessionStateService } from '../audio/services/audio-session-state.service';
import { I18nService } from '../core/i18n/i18n.service';
import { ToastService } from '../shared/services/toast.service';
import { CAMPAIGN_STORY_TARGET, StoryPresenceService } from '../shared/services/story-presence.service';
import { provideTestLanguage } from '../core/i18n/testing';
import { en } from '../core/i18n/en';
import { nl } from '../core/i18n/nl';

describe('CampaignStoryPageComponent', () => {
  let fixture: ComponentFixture<CampaignStoryPageComponent>;
  let element: HTMLElement;

  const versions = signal<CampaignStoryVersion[]>([]);
  const sessions = signal<{ id: string; status: string; content: string; storyRegenerationCount?: number }[]>([]);
  const currentUser = signal<{ uid: string } | null>({ uid: 'owner' });
  const campaign = signal<{ id: string; name: string; ownerId: string; settings?: { kankaEnabled?: boolean; kankaCampaignId?: string } }>(
    { id: 'campaign-1', name: 'Grauwhaven', ownerId: 'owner' }
  );
  const linkKanka = () => campaign.update(current => ({ ...current, settings: { kankaEnabled: true, kankaCampaignId: '123' } }));
  const storyService = {
    versions,
    isLoading: signal(false),
    generate: vi.fn(),
    generatePodcast: vi.fn(),
    saveEdit: vi.fn(),
  };

  /** Stands in for the presence service the page provides itself. */
  const otherEditors = signal<string[]>([]);
  const presence = { others: otherEditors, watch: vi.fn(), setEditing: vi.fn() };
  const confirm = vi.fn();

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
  const generateButton = () => element.querySelector('[data-testid="generate-story"]') as HTMLButtonElement;
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
            selectedCampaign: campaign,
            selectedCampaignId: signal('campaign-1'),
          },
        },
        { provide: AudioSessionStateService, useValue: { sessions } },
        provideRouter([]),
        provideTestLanguage(language),
      ],
    });
    TestBed.overrideComponent(CampaignStoryPageComponent, {
      set: { providers: [{ provide: StoryPresenceService, useValue: presence }] },
    });
    vi.spyOn(TestBed.inject(ToastService), 'confirm').mockImplementation(confirm);
    fixture = TestBed.createComponent(CampaignStoryPageComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    versions.set([]);
    sessions.set([]);
    currentUser.set({ uid: 'owner' });
    campaign.set({ id: 'campaign-1', name: 'Grauwhaven', ownerId: 'owner' });
    storyService.generate.mockResolvedValue(undefined);
    storyService.saveEdit.mockResolvedValue(true);
    otherEditors.set([]);
    confirm.mockResolvedValue(true);
  });

  describe('editing the story by hand', () => {
    const editButton = () => element.querySelector('[data-testid="edit-story"]') as HTMLButtonElement | null;
    const form = () => element.querySelector('[data-testid="story-edit-form"]') as HTMLFormElement | null;
    const contentField = () => element.querySelector('[data-testid="story-edit-content"]') as HTMLTextAreaElement;
    const saveButton = () => element.querySelector('[data-testid="story-edit-save"]') as HTMLButtonElement;

    function startEditing(): void {
      editButton()?.click();
      fixture.detectChanges();
    }
    function typeStory(value: string): void {
      contentField().value = value;
      contentField().dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }

    it('is offered on the newest version only', () => {
      versions.set([version({ version: 2 }), version({ version: 1 })]);
      create();
      expect(editButton()?.textContent).toContain(en.campaignStory.edit.button);

      fixture.componentInstance.selectVersion(1);
      fixture.detectChanges();
      expect(editButton()).toBeNull();
    });

    it('is for every member, while writing a new version stays with the owner', async () => {
      currentUser.set({ uid: 'member' });
      const latest = version({});
      versions.set([latest]);
      create();
      expect(generateButton()).toBeNull();

      startEditing();
      typeStory('De party vertrok bij zonsopgang.');
      saveButton().click();
      await fixture.whenStable();

      expect(storyService.saveEdit).toHaveBeenCalledWith(latest, expect.objectContaining({ content: 'De party vertrok bij zonsopgang.' }));
    });

    it('tells the other members when this member has the form open, and when it closes', () => {
      versions.set([version({})]);
      create();
      expect(presence.watch).toHaveBeenCalledWith('campaign-1', CAMPAIGN_STORY_TARGET);
      expect(presence.setEditing).toHaveBeenLastCalledWith(false);

      startEditing();
      expect(presence.setEditing).toHaveBeenLastCalledWith(true);

      (Array.from(form()?.querySelectorAll('button') ?? []).find(b => b.textContent?.includes(en.common.cancel)) as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(presence.setEditing).toHaveBeenLastCalledWith(false);
    });

    it('shows who else is editing', () => {
      versions.set([version({})]);
      otherEditors.set(['Mira']);
      create('nl');

      expect(text()).toContain(nl.storyEdit.othersEditing(['Mira']));
    });

    it('keeps the form, with the text in it, when the story changed in the meantime', async () => {
      storyService.saveEdit.mockResolvedValue(false);
      versions.set([version({})]);
      create();

      startEditing();
      typeStory('Mijn verbeterde tekst');
      saveButton().click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(contentField().value).toBe('Mijn verbeterde tekst');
      expect(TestBed.inject(ToastService).toasts()).toEqual([]);
    });

    it('names the member whose edit is on the newest version, but not this member themselves', () => {
      versions.set([version({ editedBy: 'member', editedByName: 'Mira' })]);
      create();
      expect(fixture.componentInstance.changedBy()).toBe('Mira');

      currentUser.set({ uid: 'member' });
      expect(fixture.componentInstance.changedBy()).toBe('');
    });

    it('keeps an open form when the owner starts a new version, with saving held back until it is done', () => {
      currentUser.set({ uid: 'member' });
      versions.set([version({})]);
      create();
      startEditing();
      typeStory('Mijn verbeterde tekst');

      versions.set([version({ version: 2, status: 'generating', progressStep: 'writing' }), version({})]);
      fixture.detectChanges();

      expect(contentField().value).toBe('Mijn verbeterde tekst');
      expect(element.querySelector('[data-testid="story-locked"]')?.textContent).toContain(en.storyEdit.newVersionBeingWritten);
      expect(saveButton().disabled).toBe(true);

      // The new version is there: the member's text is still theirs to keep or drop.
      versions.set([version({ version: 2, content: 'De nieuwe versie.' }), version({})]);
      fixture.detectChanges();
      expect(contentField().value).toBe('Mijn verbeterde tekst');
      expect(element.querySelector('[data-testid="story-conflict"]')).not.toBeNull();
    });

    it('asks the owner before writing a new version while someone else is editing', async () => {
      versions.set([version({})]);
      sessions.set([session('a')]);
      otherEditors.set(['Mira']);
      confirm.mockResolvedValue(false);
      create('nl');

      generateButton().click();
      await fixture.whenStable();
      expect(confirm).toHaveBeenCalledWith(nl.storyEdit.confirmGenerate(['Mira']));
      expect(storyService.generate).not.toHaveBeenCalled();

      confirm.mockResolvedValue(true);
      generateButton().click();
      await fixture.whenStable();
      expect(storyService.generate).toHaveBeenCalledWith('campaign-1');
    });

    it('waits while a new version is being written', () => {
      versions.set([version({ version: 2, status: 'generating', progressStep: 'writing' }), version({})]);
      create();

      expect(editButton()).toBeNull();
    });

    it('saves the edited story and shows it again', async () => {
      const latest = version({ version: 2 });
      versions.set([latest, version({ version: 1 })]);
      create();

      startEditing();
      typeStory('De party vertrok (zonder Mira).');
      saveButton().click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(storyService.saveEdit).toHaveBeenCalledWith(latest, {
        title: 'De val van Grauwhaven',
        content: 'De party vertrok (zonder Mira).',
        base: { title: 'De val van Grauwhaven', content: 'De party vertrok.' },
      });
      expect(form()).toBeNull();
    });

    it('holds a new version back until the edit is saved or dropped: unsaved text would not go along', () => {
      versions.set([version({})]);
      sessions.set([session('a')]);
      create();
      expect(generateButton().disabled).toBe(false);

      startEditing();
      expect(generateButton().disabled).toBe(true);
      expect(editButton()?.disabled).toBe(true);

      (Array.from(form()?.querySelectorAll('button') ?? []).find(b => b.textContent?.includes(en.common.cancel)) as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(form()).toBeNull();
      expect(generateButton().disabled).toBe(false);
    });

    it('keeps the text in the form and says so when saving fails', async () => {
      storyService.saveEdit.mockRejectedValue(new Error('permission-denied'));
      versions.set([version({})]);
      create('nl');

      startEditing();
      typeStory('Mijn verbeterde tekst');
      saveButton().click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(contentField().value).toBe('Mijn verbeterde tekst');
      expect(TestBed.inject(ToastService).toasts().map(toast => toast.message)).toContain(nl.storyEdit.saveFailed);
    });
  });

  describe('while a version is being generated', () => {
    it('translates the step the backend is at, and ignores its own Dutch message', () => {
      versions.set([
        version({ version: 2, status: 'generating', progressStep: 'writing', progressMessage: 'Verhaal schrijven...' }),
        version({}),
      ]);
      create();

      expect(generateButton().textContent).toContain(en.campaignStory.progress.writing);
      expect(generateButton().textContent).not.toContain('Verhaal schrijven');
      expect(generateButton().disabled).toBe(true);
    });

    it('follows the step in Dutch for a Dutch user', () => {
      versions.set([version({ version: 2, status: 'generating', progressStep: 'collecting' }), version({})]);
      create('nl');

      expect(generateButton().textContent).toContain(nl.campaignStory.progress.collecting);
    });

    it('falls back on the status for a version without a step', () => {
      versions.set([version({ version: 2, status: 'generating', progressMessage: 'Sessieverhalen verzamelen...' }), version({})]);
      create();

      expect(generateButton().textContent).toContain(en.common.busy);
      expect(generateButton().textContent).not.toContain('Sessieverhalen');
    });

    it('shows the step in place of the story while the first version is written', () => {
      versions.set([version({ version: 1, status: 'generating', progressStep: 'writing' })]);
      create();

      expect(element.querySelector('[role="status"]')?.textContent).toContain(en.campaignStory.progress.writing);
      expect(element.querySelector('[data-testid="story-empty"]')).toBeNull();
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
    expect(generateButton().textContent).toContain(nl.campaignStory.update);

    sessions.set([session('a'), session('b'), session('c')]);
    fixture.detectChanges();
    expect(text()).toContain(nl.campaignStory.changedSessions(2));
  });

  it('says how far the story runs, and that every session is in it', () => {
    versions.set([
      version({
        sourceSessions: [
          { sessionId: 'a', title: 'A', sessionDate: '2026-10-10', storyVersion: 1 },
          { sessionId: 'b', title: 'B', sessionDate: '2026-10-24', storyVersion: 1 },
        ],
      }),
    ]);
    sessions.set([session('a'), session('b')]);
    create('nl');

    expect(text()).toContain(nl.campaignStory.coversUntil('24 okt 2026'));
    expect(text()).toContain(nl.campaignStory.upToDate);
    expect(generateButton().textContent).toContain(nl.campaignStory.generate);
  });

  describe('without a story', () => {
    const emptyState = () => element.querySelector('[data-testid="story-empty"]') as HTMLElement;

    it('asks for the first session when there are none', () => {
      create();
      expect(emptyState().textContent).toContain(en.campaignStory.emptyTitle);
      expect(emptyState().textContent).toContain(en.campaignStory.emptyNoSessions);
      expect(emptyState().querySelector('a')?.getAttribute('href')).toBe('/campaign/campaign-1/sessions/new');
    });

    it('waits for the story of a session that is still being processed', () => {
      sessions.set([{ id: 'a', status: 'processing', content: '' }]);
      create();
      expect(emptyState().textContent).toContain(en.campaignStory.emptyWaiting);
      expect(emptyState().querySelector('a')?.getAttribute('href')).toBe('/campaign/campaign-1/sessions');
    });

    it('lets the owner have it written, and sends a member to the sessions', () => {
      sessions.set([session('a')]);
      create();
      expect(emptyState().textContent).toContain(en.campaignStory.emptyOwner(1));
      expect(generateButton().textContent).toContain(en.campaignStory.write);

      currentUser.set({ uid: 'member' });
      fixture.detectChanges();
      expect(emptyState().textContent).toContain(en.campaignStory.emptyMember);
      expect(generateButton()).toBeNull();
    });
  });

  describe('with Kanka linked to the campaign', () => {
    const emptyState = () => element.querySelector('[data-testid="story-empty"]') as HTMLElement;

    it('lets the owner have the story written from the journals, before any session has a story', async () => {
      linkKanka();
      create();

      expect(emptyState().textContent).toContain(en.campaignStory.emptyKanka);
      generateButton().click();
      await fixture.whenStable();
      expect(storyService.generate).toHaveBeenCalledWith('campaign-1');
    });

    it('still sends a member to the sessions', () => {
      linkKanka();
      currentUser.set({ uid: 'member' });
      create();

      expect(emptyState().textContent).toContain(en.campaignStory.emptyNoSessions);
      expect(generateButton()).toBeNull();
    });

    it('keeps the write button of an existing story usable without session stories', () => {
      versions.set([version({ sourceSessions: [], sourceJournals: [{ journalId: 7, title: 'Sessie 1', date: null, updatedAt: null }] })]);
      create();
      expect(generateButton().disabled).toBe(true);

      linkKanka();
      fixture.detectChanges();
      expect(generateButton().disabled).toBe(false);
      expect(text()).toContain(en.campaignStory.journalCount(1));
      expect(text()).not.toContain(en.campaignStory.sessionCount(0));
    });

    it('needs both the switch and the Kanka campaign', () => {
      campaign.update(current => ({ ...current, settings: { kankaEnabled: true } }));
      create();
      expect(emptyState().textContent).toContain(en.campaignStory.emptyNoSessions);
    });
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
    expect(text()).toContain(en.campaignStory.versions);
    expect(text()).toContain(en.campaignStory.podcasts.empty);

    TestBed.inject(I18nService).use('nl');
    fixture.detectChanges();

    expect(text()).toContain(nl.campaignStory.versions);
    expect(text()).toContain(nl.campaignStory.generate);
    expect(text()).toContain(nl.campaignStory.podcasts.empty);
    expect(text()).toContain(nl.campaignStory.sessionCount(1));
    expect(text()).toContain('De val van Grauwhaven');
    expect(text()).toContain('De party vertrok.');
  });
});
