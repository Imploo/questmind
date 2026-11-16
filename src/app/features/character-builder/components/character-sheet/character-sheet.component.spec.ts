import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { CharacterSheetComponent } from './character-sheet.component';
import { CharacterEntryResolverService } from '../../../../core/services/character-entry-resolver.service';
import { DndCharacter } from '../../../../shared/models/dnd-character.model';

const ability = (score: number) => ({ score, modifier: Math.floor((score - 10) / 2) });
const save = { proficient: false, modifier: 0 };

function druid(overrides: Partial<DndCharacter> = {}): DndCharacter {
  return {
    name: 'Mira', class: 'Druid', level: 5, race: 'Wood Elf', experiencePoints: 0,
    abilities: {
      strength: ability(10), dexterity: ability(14), constitution: ability(12),
      intelligence: ability(10), wisdom: ability(16), charisma: ability(8),
    },
    skills: [],
    savingThrows: { strength: save, dexterity: save, constitution: save, intelligence: save, wisdom: save, charisma: save },
    passiveWisdom: 13, proficiencies: [], languages: [], armorClass: 14, initiative: 2, speed: 35,
    hitPoints: { max: 33, current: 33, temp: 0 }, hitDice: { total: 5, current: 5, die: 'd8' },
    deathSaves: { successes: 0, failures: 0 },
    attacks: [], equipment: [], coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }, featuresAndTraits: [],
    ...overrides,
  };
}

describe('CharacterSheetComponent', () => {
  function render(character: DndCharacter): HTMLElement {
    TestBed.configureTestingModule({
      providers: [{ provide: CharacterEntryResolverService, useValue: { lookupSpellLocally: async () => null } }],
    });
    const fixture = TestBed.createComponent(CharacterSheetComponent);
    fixture.componentRef.setInput('character', character);
    fixture.componentRef.setInput('characterName', character.name);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  /** The card with this title, as the texts of its rows, part by part. */
  function card(sheet: HTMLElement, title: string): { rows: string[]; empty: string } | null {
    const section = Array.from(sheet.querySelectorAll('section.qm-panel'))
      .find(panel => text(panel.querySelector('.qm-section-title')) === title);
    if (!section) return null;
    const row = (li: Element) => Array.from(li.children).map(text).join(' | ');
    return { rows: Array.from(section.querySelectorAll('li')).map(row), empty: text(section.querySelector('.empty')) };
  }

  it('shows a saving throw instead of an attack bonus, and no roll for an attack that simply hits', () => {
    const sheet = render(druid({
      attacks: [
        { name: 'Scimitar', bonus: 5, damage: '1d6 + 2', type: 'Slashing' },
        { name: 'Moonbeam', damage: '2d10', type: 'Radiant', save: { ability: 'constitution', dc: 14 } },
        { name: 'Magic Missile', damage: '3 x 1d4 + 1', type: 'Force' },
      ],
    }));

    expect(card(sheet, 'Attacks')!.rows).toEqual([
      'Scimitar | +5 | 1d6 + 2 Slashing',
      'Moonbeam | DC 14 CON | 2d10 Radiant',
      'Magic Missile | 3 x 1d4 + 1 Force',
    ]);
  });

  it('lists the bonus actions and the reactions in their own cards, below the attacks', () => {
    const sheet = render(druid({
      bonusActions: [
        { name: 'Healing Word', effect: 'Heal 1d4 + 3 to a creature within 60 ft', source: 'Spell' },
        { name: 'Wild Shape' },
      ],
      reactions: [{ name: 'Absorb Elements', effect: 'Resist the triggering damage type', source: 'Spell' }],
    }));

    expect(card(sheet, 'Bonus Actions')!.rows).toEqual(['Healing Word | Spell | Heal 1d4 + 3 to a creature within 60 ft', 'Wild Shape']);
    expect(card(sheet, 'Reactions')!.rows).toEqual(['Absorb Elements | Spell | Resist the triggering damage type']);

    const titles = Array.from(sheet.querySelectorAll('.qm-section-title')).map(text);
    const attacks = titles.indexOf('Attacks');
    expect(titles.slice(attacks, attacks + 3)).toEqual(['Attacks', 'Bonus Actions', 'Reactions']);
  });

  it('says so when the character has no bonus actions, and leaves the reactions card out', () => {
    const sheet = render(druid({ bonusActions: [], reactions: [] }));

    expect(card(sheet, 'Bonus Actions')!.empty).toBe('No bonus actions');
    expect(card(sheet, 'Reactions')).toBeNull();
  });

  it('shows neither card for a character from before the lists were recorded', () => {
    const sheet = render(druid());

    expect(card(sheet, 'Bonus Actions')).toBeNull();
    expect(card(sheet, 'Reactions')).toBeNull();
  });
});
