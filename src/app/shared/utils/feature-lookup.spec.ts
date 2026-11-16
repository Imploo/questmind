import { describe, it, expect } from 'vitest';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { classParts, lookupFeatureFromJson } from './feature-lookup';
import { ResolutionContext } from './resolution-context';

const entry = (parent: string, name: string, desc: string, feature_type?: string) => ({
  fields: { parent, name, desc, document: 'srd-2014', feature_type },
});

// In the order of ClassFeature.json: by class, so the wizard comes last.
const DATA = [
  entry('srd_barbarian', 'Unarmored Defense', 'Your Armor Class equals 10 + your Dexterity modifier + your Constitution modifier.'),
  entry('srd_barbarian', 'Proficiency Bonus', '[Column data]', 'PROFICIENCY_BONUS'),
  entry('srd_circle-of-the-land', 'Natural Recovery', 'Starting at 2nd level, you can regain some of your magical energy.'),
  entry('srd_cleric', 'Channel Divinity', 'At 2nd level, you gain the ability to channel divine energy.'),
  entry('srd_druid', 'Spellcasting', 'Drawing on the divine essence of nature itself, you can cast druid spells.'),
  entry(
    'srd_fighter',
    'Extra Attack',
    'Beginning at 5th level, you can attack twice.\n\nThe number of attacks increases to three when you reach 11th level in this class.'
  ),
  entry('srd_fighter', 'Fighting Style', 'You adopt a particular style of fighting as your specialty.'),
  entry('srd_monk', 'Unarmored Defense', 'Your AC equals 10 + your Dexterity modifier + your Wisdom modifier.'),
  entry('srd_oath-of-devotion', 'Channel Divinity', 'When you take this oath at 3rd level, you gain Sacred Weapon.'),
  entry('srd_wizard', 'Spellcasting', 'As a student of arcane magic, you have a spellbook containing wizard spells.'),
];

const http = { get: () => of(DATA) } as unknown as HttpClient;

const context = (characterClass: string, level = 5): ResolutionContext => ({ class: characterClass, race: 'Human', level });
const describe_ = async (name: string, characterClass: string, level = 5, source?: string) =>
  (await lookupFeatureFromJson(http, { name, source }, context(characterClass, level)))?.description ?? null;

describe('lookupFeatureFromJson', () => {
  it('gives a druid the druid text of Spellcasting, not the wizard one', async () => {
    expect(await describe_('Spellcasting', 'Druid')).toContain('you can cast druid spells');
    expect(await describe_('spellcasting', 'Wizard')).toContain('spellbook');
  });

  it('tells apart the classes that share a feature name', async () => {
    expect(await describe_('Unarmored Defense', 'Monk')).toContain('Wisdom modifier');
    expect(await describe_('Unarmored Defense', 'Barbarian')).toContain('Constitution modifier');
  });

  it('has no text when no variant is of the character\'s class', async () => {
    expect(await describe_('Spellcasting', 'Artificer')).toBeNull();
    expect(await describe_('Spellcasting', 'Fighter (Eldritch Knight)')).toBeNull();
  });

  it('has no text for a name it does not know', async () => {
    expect(await describe_('Darkvision', 'Druid')).toBeNull();
  });

  it('leaves out what the character gets at a higher level', async () => {
    expect(await describe_('Extra Attack', 'Fighter', 5)).toBe('Beginning at 5th level, you can attack twice.');
    expect(await describe_('Extra Attack', 'Fighter', 10)).toBe('Beginning at 5th level, you can attack twice.');
    expect(await describe_('Extra Attack', 'Fighter', 11)).toContain('increases to three');
  });

  it('shows the whole text of a feature the character should not have yet', async () => {
    expect(await describe_('Extra Attack', 'Fighter', 3)).toContain('Beginning at 5th level');
  });

  it('gives a subclass feature to a character of that subclass', async () => {
    expect(await describe_('Channel Divinity', 'Paladin (Oath of Devotion)')).toContain('Sacred Weapon');
    expect(await describe_('Channel Divinity', 'Devotion Paladin')).toContain('Sacred Weapon');
    expect(await describe_('Natural Recovery', 'Circle of the Land Druid')).toContain('magical energy');
  });

  it('gives no subclass text to a character of another subclass', async () => {
    expect(await describe_('Channel Divinity', 'Paladin (Oath of Vengeance)')).toBeNull();
    expect(await describe_('Natural Recovery', 'Druid (Circle of the Moon)')).toBeNull();
  });

  it('trusts a subclass feature on a sheet that names no subclass only when the name is unique', async () => {
    expect(await describe_('Natural Recovery', 'Druid')).toContain('magical energy');
    expect(await describe_('Channel Divinity', 'Paladin')).toBeNull();
    expect(await describe_('Channel Divinity', 'Cleric')).toContain('channel divine energy');
  });

  it('uses the level of the class the feature comes from for a multiclass character', async () => {
    expect(await describe_('Extra Attack', 'Fighter 5 / Wizard 6', 11)).toBe('Beginning at 5th level, you can attack twice.');
    expect(await describe_('Spellcasting', 'Fighter 5 / Wizard 6', 11)).toContain('spellbook');
  });

  it('does not use class features for a racial trait, a background feature or a feat', async () => {
    expect(await describe_('Fighting Style', 'Fighter', 5, 'Feat')).toBeNull();
    expect(await describe_('Spellcasting', 'Druid', 5, 'Race')).toBeNull();
    expect(await describe_('Fighting Style', 'Fighter', 5, 'Class')).toContain('style of fighting');
  });

  it('skips table columns', async () => {
    expect(await describe_('Proficiency Bonus', 'Barbarian')).toBeNull();
  });
});

describe('classParts', () => {
  it('reads class, level and subclass of each class on the sheet', () => {
    expect(classParts({ class: 'Warlock 3 / Sorcerer 2', level: 5 })).toEqual([
      { class: 'warlock', level: 3, subclass: '' },
      { class: 'sorcerer', level: 2, subclass: '' },
    ]);
    expect(classParts({ class: 'Druid (Circle of the Land)', level: 4 })).toEqual([
      { class: 'druid', level: 4, subclass: 'circle of the land' },
    ]);
  });

  it('ignores a class the bundled data does not have', () => {
    expect(classParts({ class: 'Artificer', level: 4 })).toEqual([]);
  });
});
