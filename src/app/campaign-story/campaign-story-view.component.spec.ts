import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { CampaignStoryViewComponent } from './campaign-story-view.component';
import { CampaignStoryVersion } from './campaign-story.models';
import { I18nService } from '../core/i18n/i18n.service';
import { provideTestLanguage } from '../core/i18n/testing';
import { en } from '../core/i18n/en';
import { nl } from '../core/i18n/nl';

const story: CampaignStoryVersion = {
  id: 'v2',
  version: 2,
  status: 'completed',
  title: 'De val van Grauwhaven',
  content: '## Het begin\nDe party vertrok.',
  sourceSessions: [
    { sessionId: 'a', title: 'A', sessionDate: '2026-01-01', storyVersion: 1 },
    { sessionId: 'b', title: 'B', sessionDate: '2026-02-01', storyVersion: 1 },
  ],
  skippedSessions: [],
  createdBy: 'owner',
  createdAt: new Date('2026-10-22T10:00:00Z'),
};

describe('CampaignStoryViewComponent', () => {
  let fixture: ComponentFixture<CampaignStoryViewComponent>;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideTestLanguage('en')] });
    fixture = TestBed.createComponent(CampaignStoryViewComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('version', story);
  });

  it('renders title, meta and markdown content', () => {
    fixture.detectChanges();
    expect(element.querySelector('h2')?.textContent).toContain('De val van Grauwhaven');
    expect(element.textContent).toContain(en.common.version(2));
    expect(element.textContent).toContain(en.campaignStory.sessionCount(2));
    expect(element.querySelector('.prose h2')?.textContent).toBe('Het begin');
  });

  it('shows the older-version badge and emits backToLatest', () => {
    fixture.componentRef.setInput('isLatest', false);
    fixture.detectChanges();
    let emitted = 0;
    fixture.componentInstance.backToLatest.subscribe(() => emitted++);

    expect(element.textContent).toContain(en.campaignStory.olderVersion);
    expect(element.textContent).toContain(en.campaignStory.viewingVersion(2));
    (Array.from(element.querySelectorAll('button')).find(b => b.textContent?.includes(en.campaignStory.backToLatest)) as HTMLButtonElement).click();
    expect(emitted).toBe(1);
  });

  describe('when a member edits the story by hand', () => {
    const byTestId = (id: string) => element.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    const base = { title: 'De val van Grauwhaven', content: '## Het begin\nDe party vertrok.' };
    const form = () => element.querySelector('[data-testid="story-edit-form"]') as HTMLFormElement;
    const titleField = () => element.querySelector('[data-testid="story-edit-title"]') as HTMLInputElement;
    const contentField = () => element.querySelector('[data-testid="story-edit-content"]') as HTMLTextAreaElement;
    const saveButton = () => element.querySelector('[data-testid="story-edit-save"]') as HTMLButtonElement;
    const type = (field: HTMLInputElement | HTMLTextAreaElement, value: string) => {
      field.value = value;
      field.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };

    it('shows the story as it reads, without a form, until editing starts', () => {
      fixture.detectChanges();

      expect(form()).toBeNull();
      expect(element.querySelector('.prose')).not.toBeNull();
    });

    it('starts from the title and the markdown of the version, with what editing is for', () => {
      fixture.componentRef.setInput('editing', true);
      fixture.detectChanges();

      expect(titleField().value).toBe('De val van Grauwhaven');
      expect(contentField().value).toBe('## Het begin\nDe party vertrok.');
      expect(form().textContent).toContain(en.campaignStory.edit.help);
      expect(element.querySelector('.prose')).toBeNull();
    });

    it('emits the edited title and text, trimmed', () => {
      const saved: unknown[] = [];
      fixture.componentInstance.saved.subscribe(edit => saved.push(edit));
      fixture.componentRef.setInput('editing', true);
      fixture.detectChanges();

      type(titleField(), ' De val ');
      type(contentField(), 'De party vertrok (Mira was er niet bij).\n');
      saveButton().click();

      expect(saved).toEqual([{ title: 'De val', content: 'De party vertrok (Mira was er niet bij).', base }]);
    });

    it('does not save an empty story', () => {
      const saved: unknown[] = [];
      fixture.componentInstance.saved.subscribe(edit => saved.push(edit));
      fixture.componentRef.setInput('editing', true);
      fixture.detectChanges();

      type(contentField(), '   ');

      expect(saveButton().disabled).toBe(true);
      form().dispatchEvent(new Event('submit'));
      expect(saved).toEqual([]);
    });

    it('keeps what was typed when the version changes underneath without touching the story (podcast progress)', () => {
      fixture.componentRef.setInput('editing', true);
      fixture.detectChanges();
      type(contentField(), 'Mijn verbeterde tekst');

      fixture.componentRef.setInput('version', { ...story, latestPodcastVersion: 1 });
      fixture.componentRef.setInput('saving', true);
      fixture.detectChanges();

      expect(contentField().value).toBe('Mijn verbeterde tekst');
      expect(byTestId('story-conflict')).toBeNull();
      expect(contentField().disabled).toBe(true);
      expect(saveButton().disabled).toBe(true);
    });

    describe('and the story changes while they are typing', () => {
      const theirs = { ...story, content: 'Thalia herschreef dit.', editedBy: 'other' };
      let saved: unknown[];

      beforeEach(() => {
        saved = [];
        fixture.componentInstance.saved.subscribe(edit => saved.push(edit));
        fixture.componentRef.setInput('editing', true);
        fixture.detectChanges();
        type(contentField(), 'Mijn verbeterde tekst');
        fixture.componentRef.setInput('version', theirs);
        fixture.detectChanges();
      });

      it('keeps their text and says the story has changed, showing the current version', () => {
        expect(contentField().value).toBe('Mijn verbeterde tekst');
        expect(byTestId('story-conflict')?.textContent).toContain(en.storyEdit.changedBySomeone);
        expect(byTestId('story-conflict')?.querySelector('pre')?.textContent).toBe('Thalia herschreef dit.');
        // The plain save would overwrite the other change unseen: it makes way for the choice.
        expect(saveButton()).toBeNull();
        form().dispatchEvent(new Event('submit'));
        expect(saved).toEqual([]);
      });

      it('names who changed it when that is known', () => {
        fixture.componentRef.setInput('changedBy', 'Thalia');
        fixture.detectChanges();

        expect(byTestId('story-conflict')?.textContent).toContain(en.storyEdit.changedBy('Thalia'));
      });

      it('saves their text over the current story when they choose so', () => {
        byTestId('story-keep-mine')?.click();

        expect(saved).toEqual([
          { title: base.title, content: 'Mijn verbeterde tekst', base: { title: base.title, content: 'Thalia herschreef dit.' } },
        ]);
      });

      it('loads the current version, dropping what was typed, when they choose so', () => {
        byTestId('story-load-current')?.click();
        fixture.detectChanges();

        expect(contentField().value).toBe('Thalia herschreef dit.');
        expect(byTestId('story-conflict')).toBeNull();
        expect(saveButton()).not.toBeNull();
        expect(saved).toEqual([]);
      });
    });

    it('holds saving back while a new version is being written: the edit would not go along', () => {
      const saved: unknown[] = [];
      fixture.componentInstance.saved.subscribe(edit => saved.push(edit));
      fixture.componentRef.setInput('editing', true);
      fixture.detectChanges();
      type(contentField(), 'Mijn verbeterde tekst');

      fixture.componentRef.setInput('locked', true);
      fixture.detectChanges();

      expect(byTestId('story-locked')?.textContent).toContain(en.storyEdit.newVersionBeingWritten);
      expect(saveButton().disabled).toBe(true);
      form().dispatchEvent(new Event('submit'));
      expect(saved).toEqual([]);
      expect(contentField().value).toBe('Mijn verbeterde tekst');
    });

    it('shows who else is editing the story, also to someone who is only reading', () => {
      fixture.componentRef.setInput('otherEditors', ['Mira']);
      fixture.detectChanges();

      expect(byTestId('story-other-editors')?.textContent).toContain(en.storyEdit.othersEditing(['Mira']));
    });

    it('starts over from the version after a cancel', () => {
      let cancelled = 0;
      fixture.componentInstance.cancelled.subscribe(() => cancelled++);
      fixture.componentRef.setInput('editing', true);
      fixture.detectChanges();
      type(contentField(), 'Weggegooid');

      (Array.from(form().querySelectorAll('button')).find(b => b.textContent?.includes(en.common.cancel)) as HTMLButtonElement).click();
      expect(cancelled).toBe(1);

      fixture.componentRef.setInput('editing', false);
      fixture.detectChanges();
      fixture.componentRef.setInput('editing', true);
      fixture.detectChanges();
      expect(contentField().value).toBe('## Het begin\nDe party vertrok.');
    });

    it('says in the line under the version that it was edited by hand', () => {
      fixture.detectChanges();
      expect(element.querySelector('.qm-eyebrow')?.textContent).not.toContain(en.campaignStory.edited);

      fixture.componentRef.setInput('version', { ...story, editedAt: new Date('2026-11-20T10:00:00Z') });
      fixture.detectChanges();
      expect(element.querySelector('.qm-eyebrow')?.textContent).toContain(en.campaignStory.edited);
    });
  });

  it('falls back on a translated title when the version has none', () => {
    fixture.componentRef.setInput('version', { ...story, title: undefined });
    fixture.detectChanges();

    expect(element.querySelector('h2')?.textContent).toContain(en.campaignStory.untitled);
  });

  it('switches to Dutch without a reload, and leaves the story itself alone', () => {
    fixture.componentRef.setInput('isLatest', false);
    fixture.detectChanges();
    const englishDate = element.querySelector('.qm-eyebrow')?.textContent;

    TestBed.inject(I18nService).use('nl');
    fixture.detectChanges();

    const meta = element.querySelector('.qm-eyebrow')?.textContent ?? '';
    expect(meta).toContain(nl.common.version(2));
    expect(meta).toContain(nl.campaignStory.sessionCount(2));
    // The date follows the locale too: "22 Oct 2026" becomes "22 okt 2026".
    expect(meta).not.toBe(englishDate);
    expect(meta).toContain('okt');
    expect(element.textContent).toContain(nl.campaignStory.olderVersion);
    expect(element.querySelector('h2')?.textContent).toContain('De val van Grauwhaven');
    expect(element.querySelector('.prose h2')?.textContent).toBe('Het begin');
  });
});
