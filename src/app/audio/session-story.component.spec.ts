import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { SessionStoryComponent } from './session-story.component';
import { FirebaseService } from '../core/firebase.service';
import { provideTestLanguage } from '../core/i18n/testing';
import { en } from '../core/i18n/en';

describe('SessionStoryComponent', () => {
  let fixture: ComponentFixture<SessionStoryComponent>;
  let element: HTMLElement;
  let events: string[];

  const button = (label: string) =>
    Array.from(element.querySelectorAll('button')).find(b => b.textContent?.trim() === label) as HTMLButtonElement;
  const storyField = () => element.querySelector(`textarea[aria-label="${en.audio.story.tabStory}"]`) as HTMLTextAreaElement;

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
    fixture.componentRef.setInput('story', 'Mira opende de deur.');
    fixture.componentRef.setInput('canEditStory', true);
    fixture.componentRef.setInput('canRegenerate', true);

    events = [];
    fixture.componentInstance.storyUpdated.subscribe(story => events.push(`saved:${story}`));
    fixture.componentInstance.regenerate.subscribe(() => events.push('regenerate'));
    fixture.detectChanges();
  });

  it('explains, while editing, that the edited story goes along with a regeneration', () => {
    expect(element.textContent).not.toContain(en.audio.story.editHelp);

    button(en.audio.story.editStory).click();
    fixture.detectChanges();

    expect(storyField().value).toBe('Mira opende de deur.');
    expect(element.textContent).toContain(en.audio.story.editHelp);
  });

  it('saves the edited story', () => {
    button(en.audio.story.editStory).click();
    fixture.detectChanges();
    typeStory('Kael opende de deur.');

    button(en.audio.story.saveStory).click();

    expect(events).toEqual(['saved:Kael opende de deur.']);
  });

  it('saves edits that are still in the text field before it regenerates, so they go along', () => {
    button(en.audio.story.editStory).click();
    fixture.detectChanges();
    typeStory('Kael opende de deur (niet Mira).');

    button(en.audio.corrections.regenerate).click();

    expect(events).toEqual(['saved:Kael opende de deur (niet Mira).', 'regenerate']);
  });

  it('just regenerates when nothing was changed in the text field', () => {
    button(en.audio.story.editStory).click();
    fixture.detectChanges();

    button(en.audio.corrections.regenerate).click();

    expect(events).toEqual(['regenerate']);
  });

  it('marks a story that was edited by hand', () => {
    expect(element.querySelector('[data-testid="story-edited"]')).toBeNull();

    fixture.componentRef.setInput('edited', true);
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="story-edited"]')?.textContent).toContain(en.audio.story.edited);
  });
});
