import { describe, it, expect, vi } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { CharacterSheetComponent } from './character-sheet.component';
import { CharacterEntryResolverService } from '../../../../core/services/character-entry-resolver.service';
import { DndCharacter } from '../../../../shared/models/dnd-character.model';
import { DND_TERMS } from '../../../../shared/dnd-terms';
import { I18nService } from '../../../../core/i18n/i18n.service';
import { provideTestLanguage } from '../../../../core/i18n/testing';
import { en } from '../../../../core/i18n/en';
import { nl } from '../../../../core/i18n/nl';

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
  function create(character: DndCharacter, language: 'nl' | 'en' = 'en', editable = false): ComponentFixture<CharacterSheetComponent> {
    TestBed.configureTestingModule({
      providers: [
        provideTestLanguage(language),
        { provide: CharacterEntryResolverService, useValue: { lookupSpellLocally: async () => null } },
      ],
    });
    const fixture = TestBed.createComponent(CharacterSheetComponent);
    fixture.componentRef.setInput('character', character);
    fixture.componentRef.setInput('characterName', character.name);
    fixture.componentRef.setInput('editable', editable);
    fixture.detectChanges();
    return fixture;
  }

  function render(character: DndCharacter, language: 'nl' | 'en' = 'en'): HTMLElement {
    return create(character, language).nativeElement as HTMLElement;
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

    expect(card(sheet, DND_TERMS.attacks)!.rows).toEqual([
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

    expect(card(sheet, DND_TERMS.bonusActions)!.rows).toEqual(['Healing Word | Spell | Heal 1d4 + 3 to a creature within 60 ft', 'Wild Shape']);
    expect(card(sheet, DND_TERMS.reactions)!.rows).toEqual(['Absorb Elements | Spell | Resist the triggering damage type']);

    const titles = Array.from(sheet.querySelectorAll('.qm-section-title')).map(text);
    const attacks = titles.indexOf(DND_TERMS.attacks);
    expect(titles.slice(attacks, attacks + 3)).toEqual([DND_TERMS.attacks, DND_TERMS.bonusActions, DND_TERMS.reactions]);
  });

  it('says so when the character has no bonus actions, and leaves the reactions card out', () => {
    const sheet = render(druid({ bonusActions: [], reactions: [] }));

    expect(card(sheet, DND_TERMS.bonusActions)!.empty).toBe(en.sheet.noBonusActions);
    expect(card(sheet, DND_TERMS.reactions)).toBeNull();
  });

  it('shows neither card for a character from before the lists were recorded', () => {
    const sheet = render(druid());

    expect(card(sheet, DND_TERMS.bonusActions)).toBeNull();
    expect(card(sheet, DND_TERMS.reactions)).toBeNull();
  });

  describe('languages', () => {
    const titles = (sheet: HTMLElement) => Array.from(sheet.querySelectorAll('.qm-section-title')).map(text);
    const tabLabels = (sheet: HTMLElement) => Array.from(sheet.querySelectorAll('app-sheet-section-tabs .tab')).map(text);

    it('switches the app texts at once and keeps the game terms English', () => {
      const fixture = create(druid({ bonusActions: [], experiencePoints: 12500, playerName: 'Sanne' }));
      const sheet = fixture.nativeElement as HTMLElement;
      const termsBefore = { titles: titles(sheet), tabs: tabLabels(sheet), abilities: text(sheet.querySelector('[data-section="abilities"]')) };

      expect(card(sheet, DND_TERMS.attacks)!.empty).toBe(en.sheet.noAttacks);
      expect(card(sheet, DND_TERMS.bonusActions)!.empty).toBe(en.sheet.noBonusActions);
      expect(text(sheet.querySelector('.qm-hero'))).toContain('12,500 XP');
      expect(text(sheet.querySelector('.qm-hero'))).toContain(en.sheet.player('Sanne'));

      TestBed.inject(I18nService).use('nl');
      fixture.detectChanges();

      expect(card(sheet, DND_TERMS.attacks)!.empty).toBe('Nog geen attacks ingesteld');
      expect(card(sheet, DND_TERMS.bonusActions)!.empty).toBe(nl.sheet.noBonusActions);
      expect(text(sheet.querySelector('.qm-hero'))).toContain('12.500 XP');
      expect(text(sheet.querySelector('.qm-hero'))).toContain(nl.sheet.player('Sanne'));
      expect(sheet.querySelector('app-sheet-section-tabs nav')!.getAttribute('aria-label')).toBe(nl.sheet.sectionsLabel);
      // Card titles, tabs and abilities are game terms: the same as before the switch.
      expect({ titles: titles(sheet), tabs: tabLabels(sheet), abilities: text(sheet.querySelector('[data-section="abilities"]')) }).toEqual(termsBefore);
      expect(titles(sheet)).toEqual(expect.arrayContaining(['Saving Throws', 'Skills', 'Attacks', 'Features & Traits']));
      expect(text(sheet.querySelector('.vitals'))).toContain('Armor Class');
    });

    it('finds the stored skills by their English names, in Dutch too', () => {
      const sheet = render(
        druid({
          skills: [
            { name: 'Sleight of Hand', proficient: true, modifier: 5 },
            { name: 'Animal Handling', proficient: true, expertise: true, modifier: 9 },
          ],
        }),
        'nl'
      );
      const section = Array.from(sheet.querySelectorAll('section.qm-panel'))
        .find(panel => text(panel.querySelector('.qm-section-title')) === DND_TERMS.skillsTitle)!;
      const rows = Array.from(section.querySelectorAll('li')).map(li =>
        ['.truncate', '.ability-hint', '.sr-only', '.mod'].map(part => text(li.querySelector(part))).filter(Boolean).join(' | ')
      );

      expect(rows).toHaveLength(18);
      expect(rows).toContain('Sleight of Hand | DEX | (proficient) | +5');
      expect(rows).toContain('Animal Handling | WIS | (expertise) | +9');
      expect(rows).toContain('Stealth | DEX | +2');
    });

    it('offers the ways to pay for a cast in the language of the player, with a plural per language', () => {
      const caster = druid({
        spellcasting: {
          ability: 'wisdom',
          slots: [
            { level: 1, total: 4, expended: 3 },
            { level: 2, total: 3, expended: 1 },
            { level: 3, total: 2, expended: 2 },
          ],
          spells: [{ name: 'Cure Wounds', description: 'Heals.', level: 1 }],
        },
      });
      const fixture = create(caster, 'en', true);
      const sheet = fixture.nativeElement as HTMLElement;
      const cast = sheet.querySelector<HTMLButtonElement>('button.cast')!;
      const options = () => Array.from(sheet.querySelectorAll('app-cast-dialog .option')).map(option => Array.from(option.children).map(text).join(' | '));

      expect(text(cast)).toBe(en.sheet.cast.button);
      expect(cast.getAttribute('aria-label')).toBe('Cast Cure Wounds');
      cast.click();
      fixture.detectChanges();

      expect(options()).toEqual(['Level 1 | 1 slot left', 'Level 2 · upcast | 2 slots left', 'Level 3 · upcast | None left']);

      TestBed.inject(I18nService).use('nl');
      fixture.detectChanges();

      expect(cast.getAttribute('aria-label')).toBe('Cure Wounds casten');
      expect(options()).toEqual(['Level 1 | Nog 1 slot', 'Level 2 · upcast | Nog 2 slots', 'Level 3 · upcast | Niets meer over']);
    });
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
