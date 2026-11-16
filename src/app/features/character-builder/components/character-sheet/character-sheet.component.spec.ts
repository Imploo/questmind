import { describe, it, expect, vi } from 'vitest';
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

  describe('section tabs', () => {
    const tabs = (sheet: HTMLElement) => Array.from(sheet.querySelectorAll<HTMLButtonElement>('app-sheet-section-tabs .tab'));
    const caster = { spellcasting: { ability: 'wisdom', spellSaveDc: 14, spellAttackBonus: 6, slots: [], spells: [] } } as Partial<DndCharacter>;

    it('has a tab for every section of the sheet, each with a place to scroll to', () => {
      const sheet = render(druid(caster));

      expect(tabs(sheet).map(text)).toEqual(['Abilities', 'Attacks', 'Spells', 'Traits', 'Inventory']);
      for (const id of ['abilities', 'attacks', 'spells', 'traits', 'inventory']) {
        expect(sheet.querySelectorAll(`[data-section="${id}"]`).length, id).toBe(1);
      }
      expect(text(sheet.querySelector('[data-section="attacks"] .qm-section-title'))).toBe('Attacks');
      expect(text(sheet.querySelector('[data-section="traits"] .qm-section-title'))).toBe('Features & Traits');
    });

    it('leaves the spells tab out for a character that casts no spells', () => {
      const sheet = render(druid());

      expect(tabs(sheet).map(text)).toEqual(['Abilities', 'Attacks', 'Traits', 'Inventory']);
      expect(sheet.querySelector('[data-section="spells"]')).toBeNull();
    });

    it('scrolls to the section of a tapped tab and lights that tab', () => {
      // Without motion the sheet jumps there at once, so the place it goes to can be read straight away.
      const matchMedia = window.matchMedia;
      window.matchMedia = (() => ({ matches: true })) as unknown as typeof window.matchMedia;
      const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
      Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 5000 });
      try {
        TestBed.configureTestingModule({
          providers: [{ provide: CharacterEntryResolverService, useValue: { lookupSpellLocally: async () => null } }],
        });
        const fixture = TestBed.createComponent(CharacterSheetComponent);
        fixture.componentRef.setInput('character', druid(caster));
        fixture.componentRef.setInput('characterName', 'Mira');
        fixture.detectChanges();
        const sheet = fixture.nativeElement as HTMLElement;
        const spells = sheet.querySelector<HTMLElement>('[data-section="spells"]')!;
        spells.getBoundingClientRect = () => ({ top: 640 }) as DOMRect;

        tabs(sheet).find(tab => text(tab) === 'Spells')!.click();
        fixture.detectChanges();

        // The top of the section, less the room it keeps above itself (at most that of the top bar).
        const { top, behavior } = scrollTo.mock.calls.at(-1)![0] as ScrollToOptions;
        expect(behavior).toBe('instant');
        expect(top).toBeLessThanOrEqual(640);
        expect(top).toBeGreaterThanOrEqual(640 - 72);
        expect(tabs(sheet).filter(tab => tab.getAttribute('aria-current') === 'location').map(text)).toEqual(['Spells']);
        fixture.destroy();
      } finally {
        window.matchMedia = matchMedia;
        scrollTo.mockRestore();
        delete (document.documentElement as { scrollHeight?: number }).scrollHeight;
      }
    });
  });
});
