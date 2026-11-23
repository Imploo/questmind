import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { SessionStoryComponent, SessionStoryEdit } from './session-story.component';
import { FirebaseService } from '../core/firebase.service';
import { provideTestLanguage } from '../core/i18n/testing';
import { en } from '../core/i18n/en';

describe('SessionStoryComponent', () => {
  let fixture: ComponentFixture<SessionStoryComponent>;
  let element: HTMLElement;
  let saves: SessionStoryEdit[];
  let regenerations: (SessionStoryEdit | null)[];

  const STORED = 'Mira opende de deur.';

  const button = (label: string) =>
    Array.from(element.querySelectorAll('button')).find(b => b.textContent?.trim() === label) as HTMLButtonElement;
  const byTestId = (id: string) => element.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const storyField = () => element.querySelector(`textarea[aria-label="${en.audio.story.tabStory}"]`) as HTMLTextAreaElement;

  function set(input: string, value: unknown): void {
    fixture.componentRef.setInput(input, value);
    fixture.detectChanges();
  }
  function startEditing(): void {
    button(en.audio.story.editStory).click();
    fixture.detectChanges();
  }
  function typeStory(value: string): void {
    storyField().value = value;
    storyField().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        // The podcast list (not rendered on the story tab) reaches for Firebase.
        { provide: FirebaseService, useValue: {} },
        provideTestLanguage('en'),
      ],
    });
    fixture = TestBed.createComponent(SessionStoryComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('sessionId', 's1');
    fixture.componentRef.setInput('story', STORED);
    fixture.componentRef.setInput('canEditStory', true);
    fixture.componentRef.setInput('canRegenerate', true);

    saves = [];
    regenerations = [];
    fixture.componentInstance.storyUpdated.subscribe(edit => saves.push(edit));
    fixture.componentInstance.regenerate.subscribe(edit => regenerations.push(edit));
    fixture.detectChanges();
  });

  it('explains, while editing, that everyone can join in and that the edited story goes along with a regeneration', () => {
    expect(element.textContent).not.toContain(en.audio.story.editHelp);

    startEditing();

    expect(storyField().value).toBe(STORED);
    expect(element.textContent).toContain(en.audio.story.editHelp);
  });

  it('saves the edited story with the text it started from, and waits for the parent to close the form', () => {
    startEditing();
    typeStory('Kael opende de deur.');

    button(en.audio.story.saveStory).click();
    fixture.detectChanges();

    expect(saves).toEqual([{ content: 'Kael opende de deur.', baseContent: STORED }]);
    expect(storyField()).not.toBeNull();

    set('isEditing', false);
    expect(storyField()).toBeNull();
  });

  it('just closes the form when nothing was changed', () => {
    startEditing();

    button(en.audio.story.saveStory).click();
    fixture.detectChanges();

    expect(saves).toEqual([]);
    expect(storyField()).toBeNull();
  });

  it('does not save an empty story', () => {
    startEditing();
    typeStory('   ');

    expect(button(en.audio.story.saveStory).disabled).toBe(true);
  });

  it('follows the stored story while nothing is typed', () => {
    startEditing();

    set('story', 'Opnieuw gegenereerd.');

    expect(storyField().value).toBe('Opnieuw gegenereerd.');
    expect(byTestId('story-conflict')).toBeNull();
  });

  describe('when the story changes while this member is typing', () => {
    beforeEach(() => {
      startEditing();
      typeStory('Kael opende de deur.');
      set('story', 'Thalia opende de deur.');
    });

    it('keeps what was typed and says the story has changed, showing the current version', () => {
      expect(storyField().value).toBe('Kael opende de deur.');
      expect(byTestId('story-conflict')?.textContent).toContain(en.storyEdit.changedBySomeone);
      expect(byTestId('story-conflict')?.querySelector('pre')?.textContent).toBe('Thalia opende de deur.');
      // The plain save would overwrite the other change unseen: it makes way for the choice.
      expect(button(en.audio.story.saveStory)).toBeUndefined();
    });

    it('names who changed it when that is known', () => {
      set('changedBy', 'Mira');

      expect(byTestId('story-conflict')?.textContent).toContain(en.storyEdit.changedBy('Mira'));
    });

    it('saves this member\'s text over the current story when they choose so', () => {
      byTestId('story-keep-mine')?.click();

      expect(saves).toEqual([{ content: 'Kael opende de deur.', baseContent: 'Thalia opende de deur.' }]);
    });

    it('notices a further change after that choice', () => {
      byTestId('story-keep-mine')?.click();
      set('story', 'Nog een keer gewijzigd.');

      expect(byTestId('story-conflict')).not.toBeNull();
      expect(storyField().value).toBe('Kael opende de deur.');
    });

    it('loads the current version, dropping what was typed, when they choose so', () => {
      byTestId('story-load-current')?.click();
      fixture.detectChanges();

      expect(storyField().value).toBe('Thalia opende de deur.');
      expect(byTestId('story-conflict')).toBeNull();
      expect(saves).toEqual([]);
    });

    it('settles once the stored story is the text that was typed (the save arrived)', () => {
      set('story', 'Kael opende de deur.');

      expect(byTestId('story-conflict')).toBeNull();
    });
  });

  it('starts clean on another session, without the text typed for the previous one', () => {
    startEditing();
    typeStory('Kael opende de deur.');

    fixture.componentRef.setInput('sessionId', 's2');
    set('story', 'Een andere avond.');

    expect(storyField()).toBeNull();
    startEditing();
    expect(storyField().value).toBe('Een andere avond.');
    expect(byTestId('story-conflict')).toBeNull();
  });

  it('hands the edit that is still in the text field along with a regeneration, so it is saved first', () => {
    startEditing();
    typeStory('Kael opende de deur (niet Mira).');

    button(en.audio.corrections.regenerate).click();

    expect(regenerations).toEqual([{ content: 'Kael opende de deur (niet Mira).', baseContent: STORED }]);
    expect(saves).toEqual([]);
  });

  it('just regenerates when nothing was changed in the text field', () => {
    startEditing();

    button(en.audio.corrections.regenerate).click();

    expect(regenerations).toEqual([null]);
  });

  it('shows who else is editing the story', () => {
    expect(byTestId('story-other-editors')).toBeNull();

    set('otherEditors', ['Kael', 'Mira']);

    expect(byTestId('story-other-editors')?.textContent).toContain(en.storyEdit.othersEditing(['Kael', 'Mira']));
  });

  it('lets a member who is not the session owner edit the story, but not the session itself', () => {
    set('canManageSession', false);

    expect(button(en.audio.story.editStory).disabled).toBe(false);
    expect(button(en.audio.story.editDetails).disabled).toBe(true);
    expect((element.querySelector(`button[aria-label="${en.audio.story.deleteSession}"]`) as HTMLButtonElement).disabled).toBe(true);
  });

  it('holds the form while a save is on its way', () => {
    startEditing();
    typeStory('Kael opende de deur.');

    set('saving', true);

    expect(storyField().disabled).toBe(true);
    expect(button(en.audio.story.saveStory).disabled).toBe(true);
  });

  it('marks a story that was edited by hand', () => {
    expect(byTestId('story-edited')).toBeNull();

    set('edited', true);

    expect(byTestId('story-edited')?.textContent).toContain(en.audio.story.edited);
  });
});
