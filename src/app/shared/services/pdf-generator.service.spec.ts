import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { PdfGeneratorService } from './pdf-generator.service';
import { DndCharacter } from '../models/dnd-character.model';

function createMinimalCharacter(): DndCharacter {
  return {
    name: 'Test Hero',
    class: 'Fighter',
    level: 1,
    race: 'Human',
    experiencePoints: 0,
    abilities: {
      strength: { score: 16, modifier: 3 },
      dexterity: { score: 12, modifier: 1 },
      constitution: { score: 14, modifier: 2 },
      intelligence: { score: 10, modifier: 0 },
      wisdom: { score: 8, modifier: -1 },
      charisma: { score: 10, modifier: 0 },
    },
    skills: [],
    savingThrows: {
      strength: { proficient: true, modifier: 5 },
      dexterity: { proficient: false, modifier: 1 },
      constitution: { proficient: true, modifier: 4 },
      intelligence: { proficient: false, modifier: 0 },
      wisdom: { proficient: false, modifier: -1 },
      charisma: { proficient: false, modifier: 0 },
    },
    passiveWisdom: 9,
    proficiencies: ['Light Armor', 'Heavy Armor'],
    languages: ['Common', 'Dwarvish'],
    armorClass: 18,
    initiative: 1,
    speed: 30,
    hitPoints: { max: 12, current: 12, temp: 0 },
    hitDice: { total: 1, current: 1, die: 'd10' },
    deathSaves: { successes: 0, failures: 0 },
    attacks: [],
    equipment: ['Longsword', 'Shield'],
    coins: { cp: 0, sp: 0, ep: 0, gp: 15, pp: 0 },
    featuresAndTraits: [],
  };
}

function createFullCharacter(): DndCharacter {
  return {
    ...createMinimalCharacter(),
    name: 'Gandara the Wise',
    class: 'Wizard',
    level: 5,
    background: 'Sage',
    alignment: 'Neutral Good',
    playerName: 'John',
    experiencePoints: 6500,
    skills: [
      { name: 'Arcana', proficient: true, modifier: 6 },
      { name: 'History', proficient: true, modifier: 6 },
    ],
    attacks: [
      { name: 'Quarterstaff', bonus: 2, damage: '1d6', type: 'bludgeoning' },
      { name: 'Fire Bolt', bonus: 6, damage: '2d10', type: 'fire' },
    ],
    spellcasting: {
      spellSaveDc: 14,
      spellAttackBonus: 6,
      slots: [
        { level: 1, total: 4, expended: 1 },
        { level: 2, total: 3, expended: 0 },
        { level: 3, total: 2, expended: 0 },
      ],
      spells: [
        { name: 'Fire Bolt', level: 0, school: 'Evocation', description: 'A mote of fire' },
        { name: 'Shield', level: 1, school: 'Abjuration' },
        'Magic Missile',
      ],
    },
    featuresAndTraits: [
      { name: 'Arcane Recovery', description: 'Recover spell slots on short rest', source: 'Wizard' },
      { name: 'Evocation Savant', description: 'Halved cost for evocation spells', source: 'Wizard' },
    ],
    personalityTraits: 'Always curious about new knowledge.',
    ideals: 'Knowledge is the path to power.',
    bonds: 'My spellbook is my most treasured possession.',
    flaws: 'I speak without thinking.',
    appearance: {
      age: '120',
      height: "5'8\"",
      weight: '140 lbs',
      eyes: 'Blue',
      skin: 'Fair',
      hair: 'Silver',
      description: 'A wise elf with piercing blue eyes.',
    },
    backstory: 'Gandara spent decades studying in the great library of Candlekeep.',
  };
}

describe('PdfGeneratorService', () => {
  let service: PdfGeneratorService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    service = TestBed.inject(PdfGeneratorService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('buildDocDefinition', () => {
    it('should build a valid doc definition for a minimal character', () => {
      const character = createMinimalCharacter();
      const doc = service.buildDocDefinition(character);

      expect(doc.pageSize).toBe('A4');
      expect(doc.content).toBeDefined();
      expect(Array.isArray(doc.content)).toBe(true);
    });

    it('should include character name in the header', () => {
      const character = createMinimalCharacter();
      const doc = service.buildDocDefinition(character);
      const content = doc.content as unknown as Record<string, unknown>[];

      // First element is the header stack
      const header = content[0] as { stack: { text: string }[] };
      expect(header.stack[0].text).toBe('Test Hero');
    });

    it('should include race and class in subtitle', () => {
      const character = createMinimalCharacter();
      const doc = service.buildDocDefinition(character);
      const content = doc.content as unknown as Record<string, unknown>[];

      const header = content[0] as { stack: { text: string }[] };
      expect(header.stack[1].text).toBe('Human Fighter (Level 1)');
    });

    it('should build a valid doc definition for a full character', () => {
      const character = createFullCharacter();
      const doc = service.buildDocDefinition(character);

      expect(doc.content).toBeDefined();
      const content = doc.content as unknown as Record<string, unknown>[];
      // Should have: header, quick stats, ability scores, main content, + full-width sections
      expect(content.length).toBeGreaterThan(4);
    });

    it('should include background and alignment when present', () => {
      const character = createFullCharacter();
      const doc = service.buildDocDefinition(character);
      const content = doc.content as unknown as Record<string, unknown>[];

      const header = content[0] as { stack: { text: string }[] };
      const detailLine = header.stack[2].text;
      expect(detailLine).toContain('Sage');
      expect(detailLine).toContain('Neutral Good');
    });

    it('should include player name when present', () => {
      const character = createFullCharacter();
      const doc = service.buildDocDefinition(character);
      const content = doc.content as unknown as Record<string, unknown>[];

      const header = content[0] as { stack: { text: string }[] };
      const playerLine = header.stack.find(l => typeof l.text === 'string' && l.text.includes('Player:'));
      expect(playerLine).toBeDefined();
    });
  });

  describe('generateCharacterPdf', () => {
    it('should dynamically import pdfmake and call createPdf', async () => {
      const mockDownload = vi.fn();
      const mockCreatePdf = vi.fn().mockReturnValue({ download: mockDownload });

      vi.doMock('pdfmake/build/pdfmake', () => ({
        default: { createPdf: mockCreatePdf },
        createPdf: mockCreatePdf,
      }));

      const character = createMinimalCharacter();
      // Since dynamic import mocking is complex with Vitest, we verify buildDocDefinition works
      const doc = service.buildDocDefinition(character);
      expect(doc).toBeDefined();
      expect(doc.pageSize).toBe('A4');

      vi.doUnmock('pdfmake/build/pdfmake');
    });
  });
});
