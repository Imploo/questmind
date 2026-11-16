import { describe, it, expect } from 'vitest';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { lookupSpellFromJson } from './spell-lookup';
import { ResolutionContext } from './resolution-context';

const spell = (name: string, level: number, desc: string, higher_level: string) => ({
  fields: {
    name, level, desc, higher_level,
    casting_time: 'action', range_text: '120 feet', duration: 'instantaneous',
    verbal: true, somatic: true, material: false, school: 'evocation', concentration: false, ritual: false,
  },
});

const DATA = [
  spell(
    'Fire Bolt', 0,
    'On a hit, the target takes 1d10 fire damage.',
    "This spell's damage increases by 1d10 when you reach 5th level (2d10), 11th level (3d10), and 17th level (4d10)."
  ),
  spell(
    'Eldritch Blast', 0,
    'On a hit, the target takes 1d10 force damage. The spell creates more than one beam when you reach higher levels: two beams at 5th level, three beams at 11th level, and four beams at 17th level. Make a separate attack roll for each beam.',
    ''
  ),
  spell(
    'Fireball', 3,
    'Each creature takes 8d6 fire damage. A creature of 5th level or lower is not spared.',
    'When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd.'
  ),
];

const http = { get: () => of(DATA) } as unknown as HttpClient;

const context = (level: number, maxSpellSlotLevel?: number): ResolutionContext =>
  ({ class: 'Wizard', race: 'Elf', level, maxSpellSlotLevel });
const describe_ = async (name: string, ctx?: ResolutionContext) => (await lookupSpellFromJson(http, name, ctx))?.description;

describe('lookupSpellFromJson', () => {
  it('gives the full text without a character', async () => {
    expect(await describe_('fireball')).toContain('At Higher Levels. When you cast this spell using a spell slot of 4th level');
    expect(await describe_('Fire Bolt')).toContain('17th level (4d10)');
  });

  it('returns usage, level and school', async () => {
    expect(await lookupSpellFromJson(http, 'Fireball', context(5, 3))).toMatchObject({
      usage: 'Casting Time: action\nRange: 120 feet\nComponents: V, S\nDuration: instantaneous',
      level: 3,
      school: 'evocation',
      concentration: false,
    });
  });

  it('leaves out "At Higher Levels" when the character has no slot above the spell\'s level', async () => {
    const description = await describe_('Fireball', context(5, 3));

    expect(description).not.toContain('At Higher Levels');
    expect(description).toContain('A creature of 5th level or lower is not spared.');
  });

  it('keeps "At Higher Levels" when the character can cast the spell with a higher slot', async () => {
    expect(await describe_('Fireball', context(7, 4))).toContain('At Higher Levels.');
  });

  it('keeps "At Higher Levels" when the character\'s slots are unknown', async () => {
    expect(await describe_('Fireball', context(5))).toContain('At Higher Levels.');
  });

  it('shows a cantrip\'s growth once the character reached its first tier', async () => {
    expect(await describe_('Fire Bolt', context(1, 1))).toBe('On a hit, the target takes 1d10 fire damage.');
    expect(await describe_('Fire Bolt', context(5, 3))).toBe(
      "On a hit, the target takes 1d10 fire damage.\n\nAt Higher Levels. This spell's damage increases by 1d10 when you reach 5th level (2d10), 11th level (3d10), and 17th level (4d10)."
    );
  });

  it('tailors growth that is part of a cantrip\'s own text', async () => {
    expect(await describe_('Eldritch Blast', context(1, 1))).toBe(
      'On a hit, the target takes 1d10 force damage. Make a separate attack roll for each beam.'
    );
    expect(await describe_('Eldritch Blast', context(5, 3))).toContain('two beams at 5th level, three beams at 11th level, and four beams at 17th level.');
  });

  it('has nothing for a spell it does not know', async () => {
    expect(await lookupSpellFromJson(http, 'Silvery Barbs', context(5, 3))).toBeNull();
  });
});
