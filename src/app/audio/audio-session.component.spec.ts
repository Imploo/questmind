import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AudioSessionComponent } from './audio-session.component';
import { AudioSessionStateService } from './services/audio-session-state.service';
import { AudioBackendOperationsService } from './services/audio-backend-operations.service';
import { AudioCompleteProcessingService } from './services/audio-complete-processing.service';
import { AudioStorageService } from './services/audio-storage.service';
import { PodcastGenerationService } from './services/podcast-generation.service';
import { CorrectionsSaveService } from './services/corrections-save.service';
import { AudioSessionRecord } from './services/audio-session.models';
import { AuthService } from '../auth/auth.service';
import { CampaignContextService } from '../campaign/campaign-context.service';
import { CampaignService } from '../campaign/campaign.service';
import { CampaignStoryService } from '../campaign-story/campaign-story.service';
import { FirebaseService } from '../core/firebase.service';
import { ToastService } from '../shared/services/toast.service';
import { StoryEditLockService, sessionStoryTarget } from '../shared/services/story-edit-lock.service';
import { provideTestLanguage } from '../core/i18n/testing';
import { en } from '../core/i18n/en';

/** Editing the story of a session together: who may, what is saved, and what a regeneration waits for. */
describe('AudioSessionComponent: the story as a team effort', () => {
  let fixture: ComponentFixture<AudioSessionComponent>;
  let element: HTMLElement;

  const STORED = 'Mira opende de deur.';
  const session = (overrides: Partial<AudioSessionRecord> = {}): AudioSessionRecord => ({
    id: 's1',
    campaignId: 'c1',
    ownerId: 'dm',
    ownerEmail: 'dm@example.com',
    createdBy: 'dm',
    title: 'De poort',
    content: STORED,
    rawStory: 'DM: Welkom terug.',
    sessionDate: '2026-11-01',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    status: 'completed',
    ...overrides,
  });

  const sessions = signal<AudioSessionRecord[]>([]);
  const currentUser = signal<{ uid: string; displayName?: string; email?: string }>({ uid: 'dm', displayName: 'Thalia' });
  /** The other member who holds the lock on the story; '' when it is free. */
  const heldBy = signal('');

  const sessionState = {
    sessions,
    sortedSessions: sessions,
    isLoaded: signal(true),
    saveStoryEdit: vi.fn(),
    persistSessionPatch: vi.fn(),
    updateSession: vi.fn(),
  };
  const backend = { regenerateStory: vi.fn() };
  const editLock = {
    heldBy,
    watch: vi.fn(),
    acquire: vi.fn(() => Promise.resolve(heldBy() === '')),
    release: vi.fn(),
  };
  const confirm = vi.fn();

  const button = (label: string) =>
    Array.from(element.querySelectorAll('button')).find(b => b.textContent?.trim() === label) as HTMLButtonElement;
  const storyField = () => element.querySelector(`textarea[aria-label="${en.audio.story.tabStory}"]`) as HTMLTextAreaElement | null;
  const byTestId = (id: string) => element.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  function create(): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestLanguage('en'),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ sessionId: 's1' })),
            snapshot: { paramMap: convertToParamMap({ sessionId: 's1' }) },
          },
        },
        { provide: AuthService, useValue: { currentUser } },
        {
          provide: CampaignContextService,
          useValue: {
            selectedCampaignId: signal('c1'),
            selectedCampaign: signal({ id: 'c1', name: 'Grauwhaven', ownerId: 'dm', settings: {} }),
          },
        },
        { provide: CampaignService, useValue: { isSessionOwner: (s: { ownerId?: string }, uid: string | null) => !!uid && s.ownerId === uid } },
        { provide: AudioSessionStateService, useValue: sessionState },
        { provide: AudioBackendOperationsService, useValue: backend },
        { provide: AudioCompleteProcessingService, useValue: {} },
        { provide: AudioStorageService, useValue: { getDownloadUrl: () => Promise.resolve('') } },
        { provide: CampaignStoryService, useValue: { versions: signal([]), isLoading: signal(false) } },
        { provide: FirebaseService, useValue: {} },
      ],
    });
    TestBed.overrideComponent(AudioSessionComponent, {
      set: {
        providers: [
          { provide: StoryEditLockService, useValue: editLock },
          { provide: PodcastGenerationService, useValue: { error: signal(''), statusFor: () => ({ isGenerating: false, message: '', percent: 0 }) } },
          { provide: CorrectionsSaveService, useValue: { corrections: signal('Het is Thalia.'), saveStatus: signal('idle'), syncToSession: vi.fn(), onInput: vi.fn() } },
        ],
      },
    });
    vi.spyOn(TestBed.inject(ToastService), 'confirm').mockImplementation(confirm);
    fixture = TestBed.createComponent(AudioSessionComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  /** Asks for the form, waits for the lock, and types. */
  async function editStory(text: string): Promise<void> {
    button(en.audio.story.editStory).click();
    await settle();
    const field = storyField() as HTMLTextAreaElement;
    field.value = text;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }
  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    sessions.set([session()]);
    currentUser.set({ uid: 'dm', displayName: 'Thalia' });
    heldBy.set('');
    sessionState.saveStoryEdit.mockResolvedValue(true);
    sessionState.persistSessionPatch.mockResolvedValue(undefined);
    backend.regenerateStory.mockResolvedValue(undefined);
    confirm.mockResolvedValue(true);
  });

  describe('a member who does not own the session', () => {
    beforeEach(() => currentUser.set({ uid: 'player', email: 'mira@example.com' }));

    it('can rewrite the finished story, signed with their own name, and leaves the status alone', async () => {
      create();

      await editStory('Kael opende de deur.');
      button(en.audio.story.saveStory).click();
      await settle();

      expect(sessionState.saveStoryEdit).toHaveBeenCalledWith('s1', {
        content: 'Kael opende de deur.',
        baseContent: STORED,
        editedBy: 'player',
        editedByName: 'mira',
        markCompleted: false,
      });
      expect(storyField()).toBeNull();
    });

    it('cannot regenerate, rename or delete: that stays with the owner', () => {
      create();

      expect(button(en.audio.corrections.regenerate).disabled).toBe(true);
      expect(button(en.audio.story.editDetails).disabled).toBe(true);
    });

    it('cannot edit the story of a session that failed', () => {
      sessions.set([session({ status: 'failed' })]);
      create();

      expect(button(en.audio.story.editStory).disabled).toBe(true);
    });
  });

  it('lets the session owner clear a failed status with an edit', async () => {
    sessions.set([session({ status: 'failed' })]);
    create();

    await editStory('Kael opende de deur.');
    button(en.audio.story.saveStory).click();
    await settle();

    expect(sessionState.saveStoryEdit).toHaveBeenCalledWith('s1', expect.objectContaining({ editedBy: 'dm', markCompleted: true }));
  });

  it('keeps the form open, with the text in it, when the story changed in the meantime', async () => {
    sessionState.saveStoryEdit.mockResolvedValue(false);
    create();

    await editStory('Kael opende de deur.');
    button(en.audio.story.saveStory).click();
    await settle();

    expect(storyField()?.value).toBe('Kael opende de deur.');
  });

  it('keeps the form open and says so when saving fails', async () => {
    sessionState.saveStoryEdit.mockRejectedValue(new Error('offline'));
    create();

    await editStory('Kael opende de deur.');
    button(en.audio.story.saveStory).click();
    await settle();

    expect(storyField()?.value).toBe('Kael opende de deur.');
    expect(TestBed.inject(ToastService).toasts().map(toast => toast.message)).toContain(en.storyEdit.saveFailed);
  });

  it('names the member whose edit changed the story, unless it was regenerated since', () => {
    sessions.set([session({ storyEditedBy: 'player', storyEditedByName: 'Mira', storyEditedAt: '2026-11-20T10:00:00.000Z', storyGeneratedAt: '2026-11-01T10:00:00.000Z' })]);
    create();
    expect(fixture.componentInstance.storyChangedBy()).toBe('Mira');

    sessions.set([session({ storyEditedBy: 'player', storyEditedByName: 'Mira', storyEditedAt: '2026-11-20T10:00:00.000Z', storyGeneratedAt: '2026-11-21T10:00:00.000Z' })]);
    expect(fixture.componentInstance.storyChangedBy()).toBe('');

    sessions.set([session({ storyEditedBy: 'dm', storyEditedByName: 'Thalia', storyEditedAt: '2026-11-20T10:00:00.000Z' })]);
    expect(fixture.componentInstance.storyChangedBy()).toBe('');
  });

  describe('the lock: one member edits at a time', () => {
    it('takes the lock on this story before the form opens, and gives it back when the form closes', async () => {
      create();
      expect(editLock.watch).toHaveBeenCalledWith('c1', sessionStoryTarget('s1'));

      button(en.audio.story.editStory).click();
      await settle();
      expect(editLock.acquire).toHaveBeenCalledTimes(1);
      expect(storyField()).not.toBeNull();
      editLock.release.mockClear();

      button(en.audio.story.preview).click();
      fixture.detectChanges();
      expect(editLock.release).toHaveBeenCalled();
    });

    it('cannot start while someone else is editing, and says who', () => {
      heldBy.set('Mira');
      create();

      expect(byTestId('story-locked-by')?.textContent).toContain(en.storyEdit.lockedBy('Mira'));
      expect((byTestId('story-edit-toggle') as HTMLButtonElement).disabled).toBe(true);
    });

    it('does not open the form when someone else takes the lock at the same moment', async () => {
      create();
      editLock.acquire.mockResolvedValueOnce(false);
      heldBy.set('Mira');

      await fixture.componentInstance.startStoryEdit();
      fixture.detectChanges();

      expect(storyField()).toBeNull();
      expect(TestBed.inject(ToastService).toasts().map(toast => toast.message)).toContain(en.storyEdit.lockedBy('Mira'));
    });

    it('says so when the lock could not be reached', async () => {
      create();
      editLock.acquire.mockResolvedValueOnce(false);

      button(en.audio.story.editStory).click();
      await settle();

      expect(storyField()).toBeNull();
      expect(TestBed.inject(ToastService).toasts().map(toast => toast.message)).toContain(en.storyEdit.startFailed);
    });

    it('does not save without the lock: someone else took it over during a long pause', async () => {
      create();
      await editStory('Kael opende de deur.');

      editLock.acquire.mockResolvedValueOnce(false);
      await expect(
        fixture.componentInstance.saveStoryEdits({ content: 'Kael opende de deur.', baseContent: STORED })
      ).resolves.toBe(false);
      fixture.detectChanges();

      expect(sessionState.saveStoryEdit).not.toHaveBeenCalled();
      expect(storyField()?.value).toBe('Kael opende de deur.');
    });
  });

  describe('regenerating', () => {
    it('saves what is still in the edit form first, then regenerates', async () => {
      const order: string[] = [];
      sessionState.saveStoryEdit.mockImplementation(async () => { order.push('save'); return true; });
      backend.regenerateStory.mockImplementation(async () => { order.push('regenerate'); });
      create();

      await editStory('Kael opende de deur (niet Mira).');
      button(en.audio.corrections.regenerate).click();
      await settle();

      expect(order).toEqual(['save', 'regenerate']);
      expect(sessionState.saveStoryEdit).toHaveBeenCalledWith('s1', expect.objectContaining({ content: 'Kael opende de deur (niet Mira).', baseContent: STORED }));
      expect(backend.regenerateStory).toHaveBeenCalledWith('c1', 's1', expect.objectContaining({ userCorrections: 'Het is Thalia.' }));
    });

    it('does not regenerate when that save is refused: the story changed, the form says so', async () => {
      sessionState.saveStoryEdit.mockResolvedValue(false);
      create();

      await editStory('Kael opende de deur.');
      button(en.audio.corrections.regenerate).click();
      await settle();

      expect(backend.regenerateStory).not.toHaveBeenCalled();
      expect(sessionState.persistSessionPatch).not.toHaveBeenCalled();
      expect(storyField()?.value).toBe('Kael opende de deur.');
    });

    it('asks first when someone else is editing: what they have not saved would not go along', async () => {
      heldBy.set('Mira');
      confirm.mockResolvedValue(false);
      create();

      button(en.audio.corrections.regenerate).click();
      await settle();
      expect(confirm).toHaveBeenCalledWith(en.storyEdit.confirmGenerate('Mira'));
      expect(backend.regenerateStory).not.toHaveBeenCalled();

      confirm.mockResolvedValue(true);
      button(en.audio.corrections.regenerate).click();
      await settle();
      expect(backend.regenerateStory).toHaveBeenCalledTimes(1);
    });

    it('regenerates without asking when nobody else is editing', async () => {
      create();

      button(en.audio.corrections.regenerate).click();
      await settle();

      expect(confirm).not.toHaveBeenCalled();
      expect(backend.regenerateStory).toHaveBeenCalledTimes(1);
    });
  });
});
