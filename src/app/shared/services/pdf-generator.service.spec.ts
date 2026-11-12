import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { PdfGeneratorService, toPlainText } from './pdf-generator.service';
import { DndCharacter } from '../models/dnd-character.model';

function createCharacter(): DndCharacter {
  return {
    name: 'Test Hero',
    class: 'Wizard',
    level: 3,
    race: 'Human',
    experiencePoints: 0,
    abilities: {
      strength: { score: 10, modifier: 0 },
      dexterity: { score: 10, modifier: 0 },
      constitution: { score: 10, modifier: 0 },
      intelligence: { score: 16, modifier: 3 },
      wisdom: { score: 10, modifier: 0 },
      charisma: { score: 10, modifier: 0 },
    },
    skills: [],
    savingThrows: {
      strength: { proficient: false, modifier: 0 },
      dexterity: { proficient: false, modifier: 0 },
      constitution: { proficient: false, modifier: 0 },
      intelligence: { proficient: true, modifier: 5 },
      wisdom: { proficient: true, modifier: 2 },
      charisma: { proficient: false, modifier: 0 },
    },
    passiveWisdom: 10,
    proficiencies: [],
    languages: ['Common'],
    armorClass: 10,
    initiative: 0,
    speed: 30,
    hitPoints: { max: 14, current: 14, temp: 0 },
    hitDice: { total: 3, current: 3, die: 'd6' },
    deathSaves: { successes: 0, failures: 0 },
    attacks: [],
    equipment: [],
    coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    featuresAndTraits: [],
  };
}

/** All text in a pdfmake content tree, flattened. */
function collectText(content: unknown): string[] {
  if (content === undefined || content === null) return [];
  if (typeof content === 'string') return [content];
  if (Array.isArray(content)) return content.flatMap(c => collectText(c));
  const node = content as { text?: unknown; stack?: unknown };
  return [...collectText(node.text), ...collectText(node.stack)];
}

describe('PdfGeneratorService', () => {
  let service: PdfGeneratorService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PdfGeneratorService);
  });

  describe('buildAppendixDefinition', () => {
    it('returns null when there is nothing to describe', () => {
      expect(service.buildAppendixDefinition(createCharacter(), [], [])).toBeNull();
    });

    it('describes every feature, with a placeholder when the text is missing', () => {
      const doc = service.buildAppendixDefinition(createCharacter(), [], [
        { name: 'Arcane Recovery', source: 'Wizard', description: 'Once per day, **recover** spell slots.' },
        { name: 'Mystery Trait' },
      ])!;
      const text = collectText(doc.content);

      expect(doc.pageSize).toBe('LETTER');
      expect(text).toContain('Features & Traits');
      expect(text).toContain('Arcane Recovery');
      expect(text).toContain('Once per day, recover spell slots.');
      expect(text).toContain('Mystery Trait');
      expect(text).toContain('No description available.');
    });

    it('groups spells by level and includes usage and description', () => {
      const doc = service.buildAppendixDefinition(createCharacter(), [
        { name: 'Shield', level: 1, school: 'abjuration', usage: 'Casting Time: 1 reaction\nRange: Self', description: 'An invisible barrier.' },
        { name: 'Fire Bolt', level: 0, school: 'evocation', description: 'A mote of fire.' },
        { name: 'Homebrew Zap' },
      ], [])!;
      const text = collectText(doc.content);

      expect(text.indexOf('Cantrips')).toBeLessThan(text.indexOf('Level 1'));
      expect(text.indexOf('Fire Bolt')).toBeLessThan(text.indexOf('Shield'));
      expect(text).toContain('Level 1 • Abjuration');
      expect(text).toContain('Casting Time:');
      expect(text).toContain(' 1 reaction');
      expect(text).toContain('An invisible barrier.');
      expect(text).toContain('Other spells');
      expect(text).toContain('Homebrew Zap');
    });

    it('describes hand-kept inventory items that have a description', () => {
      const doc = service.buildAppendixDefinition(createCharacter(), [], [], [], [
        { id: 'a', name: 'Potion of Healing', value: '2', description: 'Regain 2d4 + 2 hit points.' },
        { id: 'b', name: 'Arrows', value: '20', description: '' },
      ])!;
      const text = collectText(doc.content);

      expect(text).toContain('Inventory');
      expect(text).toContain('Potion of Healing');
      expect(text).toContain('Regain 2d4 + 2 hit points.');
      expect(text).not.toContain('Arrows');
    });

    it('adds no inventory section when no item has a description', () => {
      expect(service.buildAppendixDefinition(createCharacter(), [], [], [], [
        { id: 'b', name: 'Arrows', value: '20', description: '' },
      ])).toBeNull();
    });

    it('repeats sheet text that did not fit', () => {
      const doc = service.buildAppendixDefinition(createCharacter(), [], [], [
        { title: 'Appearance & Backstory', text: 'A very long story.' },
      ])!;
      const text = collectText(doc.content);

      expect(text).toContain('Appearance & Backstory');
      expect(text).toContain('A very long story.');
    });
  });

  describe('buildCharacterPdf', () => {
    it('fills the official template and appends the description pages', async () => {
      const character: DndCharacter = {
        ...createCharacter(),
        backstory: 'Born in Waterdeep \u2212 raised by wolves \u2192 became a wizard.',
        spellcasting: { spellSaveDc: 13, spellAttackBonus: 5, slots: [{ level: 1, total: 4, expended: 0 }] },
      };
      const pending = service.buildCharacterPdf(
        character,
        [{ name: 'Magic Missile', level: 1, usage: 'Casting Time: 1 action', description: 'Three darts.' }],
        [{ name: 'Arcane Recovery', description: 'Recover spell slots.' }]
      );
      const http = TestBed.inject(HttpTestingController);
      const url = '/templates/dnd-5e-character-sheet.pdf';
      // pdf-lib is imported dynamically first, so the request is not sent synchronously.
      let requests = http.match(url);
      for (let i = 0; i < 100 && !requests.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 20));
        requests = http.match(url);
      }
      expect(requests.length).toBe(1);
      const template = Uint8Array.from(readFileSync('public/templates/dnd-5e-character-sheet.pdf'));
      requests[0].flush(template.buffer);

      const result = await PDFDocument.load(await pending);
      const form = result.getForm();

      expect(result.getPageCount()).toBeGreaterThan(3);
      expect(form.getTextField('CharacterName').getText()).toBe('Test Hero');
      expect(form.getTextField('ClassLevel').getText()).toBe('Wizard 3');
      expect(form.getTextField('Spells 1015').getText()).toBe('Magic Missile');
      expect(form.getTextField('Features and Traits').getText()).toContain('Arcane Recovery');
      expect(form.getTextField('Backstory').getText()).toBe('Born in Waterdeep - raised by wolves -> became a wizard.');
      expect(form.getCheckBox('Check Box 20').isChecked()).toBe(true);
      http.verify();
    });
  });

  describe('toPlainText', () => {
    it('strips markdown emphasis, headings, links and table separators', () => {
      const md = '## Title\n**Bold** and *italic* and _under_ [link](http://x)\n| a | b |\n|---|---|\n| 1 | 2 |\n- item';
      expect(toPlainText(md)).toBe('Title\nBold and italic and under link\na   b\n1   2\n• item');
    });

    it('keeps dice expressions and asterisks inside words intact', () => {
      expect(toPlainText('Deal 2d6 + 3 damage')).toBe('Deal 2d6 + 3 damage');
    });
  });
});
