import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { RestPreviewRow } from '../../../../shared/utils/character-play-state';
import { en } from '../../../../core/i18n/en';
import { nl } from '../../../../core/i18n/nl';
import { provideTestLanguage } from '../../../../core/i18n/testing';
import { RestDialogComponent } from './rest-dialog.component';

const rows: RestPreviewRow[] = [
  { kind: 'hitPoints', before: 12, after: 44 },
  { kind: 'temporaryHitPoints', before: 5, after: 0 },
  { kind: 'spellSlots', restored: 5 },
  { kind: 'features', recharged: ['Hellish Rebuke', 'Channel Divinity'] },
  { kind: 'hitDice', before: 1, after: 3 },
  { kind: 'exhaustion', before: 2, after: 1 },
  { kind: 'concentration', spell: 'Bless' },
];

describe('RestDialogComponent', () => {
  // English on purpose rather than by default: a language another spec left in localStorage would decide otherwise.
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideTestLanguage('en')] }));

  function render(preview: RestPreviewRow[]) {
    const fixture = TestBed.createComponent(RestDialogComponent);
    fixture.componentRef.setInput('rows', preview);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const shown = () =>
      Array.from(host.querySelectorAll('.row')).map(row => [row.querySelector('dt')!.textContent, row.querySelector('dd')!.textContent]);
    return { host, shown };
  }

  it('lists what a long rest changes', () => {
    const { host, shown } = render(rows);

    expect(host.querySelector('h2')!.textContent).toBe(en.play.rest.title);
    expect(shown()).toEqual([
      ['Hit Points', '12 → 44'],
      ['Temporary Hit Points', '5 → 0'],
      ['Spell Slots', '5 restored'],
      ['Features', 'Hellish Rebuke, Channel Divinity'],
      ['Hit Dice', '1 → 3'],
      ['Exhaustion', '2 → 1'],
      ['Concentration', 'Bless ends'],
    ]);
  });

  it('keeps the game terms English in a Dutch dialog', () => {
    TestBed.configureTestingModule({ providers: [provideTestLanguage('nl')] });
    const { host, shown } = render(rows);

    expect(host.querySelector('h2')!.textContent).toBe(nl.play.rest.title);
    expect(nl.play.rest.title).toBe('Long rest nemen?');
    expect(shown()).toContainEqual(['Spell Slots', '5 hersteld']);
    expect(shown()).toContainEqual(['Concentration', 'Bless stopt']);
    expect(shown()).toContainEqual(['Hit Points', '12 → 44']);
  });

  it('says so when there is nothing to restore', () => {
    const { host, shown } = render([]);

    expect(shown()).toEqual([]);
    expect(Array.from(host.querySelectorAll('.note')).map(note => note.textContent)).toEqual([
      en.play.rest.nothingToRestore,
      en.play.rest.note,
    ]);
  });
});
