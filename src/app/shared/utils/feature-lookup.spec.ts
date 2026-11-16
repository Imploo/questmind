import { describe, it, expect } from 'vitest';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { classParts, lookupFeatureFromJson, nameParts } from './feature-lookup';
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
  entry(
    'srd_hunter',
    "Hunter's Prey",
    'At 3rd level, you gain one of the following features of your choice.\r\n\r\n' +
    '***Colossus Slayer.*** The creature takes an extra 1d8 damage.\r\n\r\n' +
    '***Giant Killer.*** You can use your reaction to attack that creature.'
  ),
  entry(
    'srd_monk',
    'Ki',
    'Starting at 2nd level, you harness ki. You start knowing three such features.\n\n' +
    '### Flurry of Blows\n\nYou can spend 1 ki point to make two unarmed strikes.\n\n' +
    '### Patient Defense\n\nYou can spend 1 ki point to take the Dodge action.'
  ),
  entry(
    'srd_sorcerer',
    'Metamagic',
    'At 3rd level, you gain the ability to twist your spells. You gain two of the following Metamagic options of your choice. You gain another one at 10th and 17th level.\r\n\r\n' +
    'You can use only one Metamagic option on a spell when you cast it.\r\n\r\n' +
    '### Careful Spell\r\n\r\nYou can protect some creatures from the spell.\r\n\r\n' +
    '### Quickened Spell\r\n\r\nYou can spend 2 sorcery points to cast as a bonus action.\r\n\r\n' +
    '### Twinned Spell\r\n\r\nYou can target a second creature.\r\n\r\nA spell must be incapable of targeting more than one creature.'
  ),
  entry('srd_warlock', 'Eldritch Invocations', 'At 2nd level, you gain two eldritch invocations of your choice.'),
  entry(
    'srd_warlock',
    'Eldritch Invocation List',
    'If an eldritch invocation has prerequisites, you must meet them to learn it.\n\n' +
    '### Agonizing Blast\n\nPrerequisite: eldritch blast cantrip\n\nAdd your Charisma modifier to the damage.\nArmor of Shadows\n\nYou can cast mage armor on yourself at will.\n\n' +
    '### Ascendant Step\n\nPrerequisite: 9th level\n\nYou can cast levitate on yourself at will.',
    'CLASS_FEATURE_OPTION_LIST'
  ),
  entry('srd_wizard', 'Spellcasting', 'As a student of arcane magic, you have a spellbook containing wizard spells.'),
];

const http = { get: () => of(DATA) } as unknown as HttpClient;

const context = (characterClass: string, level = 5, features?: string[]): ResolutionContext =>
  ({ class: characterClass, race: 'Human', level, features });
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

describe('lookupFeatureFromJson: features with a choice', () => {
  const metamagic = async (features: string[], name = 'Metamagic', level = 3) =>
    (await lookupFeatureFromJson(http, { name }, context('Sorcerer', level, features)))?.description ?? null;

  it('shows only the options the character has as features of their own', async () => {
    const text = await metamagic(['Metamagic', 'Quickened Spell', 'Twinned Spell']);

    expect(text).toContain('You can use only one Metamagic option on a spell');
    expect(text).toContain('### Quickened Spell');
    expect(text).toContain('### Twinned Spell');
    expect(text).toContain('A spell must be incapable of targeting more than one creature.');
    expect(text).not.toContain('Careful Spell');
  });

  it('recognises options written as "Metamagic: Quickened Spell"', async () => {
    const text = await metamagic(['Metamagic', 'Metamagic: Quickened Spell', 'Metamagic - Careful Spell']);

    expect(text).toContain('### Quickened Spell');
    expect(text).toContain('### Careful Spell');
    expect(text).not.toContain('Twinned Spell');
  });

  it('reads the options from the feature\'s own name', async () => {
    const text = await metamagic(['Careful Spell'], 'Metamagic (Quickened Spell, Twinned Spell)');

    expect(text).toContain('You gain two of the following Metamagic options');
    expect(text).toContain('### Quickened Spell');
    expect(text).toContain('### Twinned Spell');
    expect(text).not.toContain('Careful Spell');
  });

  it('shows every option when the character names none of them', async () => {
    const text = await metamagic(['Metamagic', 'Font of Magic']);

    expect(text).toContain('### Careful Spell');
    expect(text).toContain('### Twinned Spell');
    expect(await metamagic([])).toContain('### Careful Spell');
  });

  it('still leaves out what comes at a higher level', async () => {
    expect(await metamagic(['Quickened Spell'], 'Metamagic', 3)).not.toContain('10th and 17th level');
    expect(await metamagic(['Quickened Spell'], 'Metamagic', 10)).toContain('10th and 17th level');
  });

  it('gives an option that is an entry of its own just its own text', async () => {
    expect(await metamagic(['Metamagic', 'Quickened Spell'], 'Quickened Spell')).toBe(
      'You can spend 2 sorcery points to cast as a bonus action.'
    );
    expect(await metamagic([], 'Quickened Spell (Metamagic)')).toBe('You can spend 2 sorcery points to cast as a bonus action.');
  });

  it('does not give an option of another class\'s feature', async () => {
    expect(await lookupFeatureFromJson(http, { name: 'Quickened Spell' }, context('Wizard'))).toBeNull();
  });

  it('scopes options that are marked in bold', async () => {
    const text = (await lookupFeatureFromJson(
      http, { name: "Hunter's Prey" }, context('Ranger (Hunter)', 3, ["Hunter's Prey: Giant Killer"])
    ))?.description;

    expect(text).toContain('you gain one of the following features of your choice');
    expect(text).toContain('***Giant Killer.***');
    expect(text).not.toContain('Colossus Slayer');
  });

  it('finds an invocation in the list of invocations, with its prerequisite', async () => {
    const invocation = async (name: string) =>
      (await lookupFeatureFromJson(http, { name }, context('Warlock', 5)))?.description ?? null;

    expect(await invocation('Agonizing Blast')).toBe('Prerequisite: eldritch blast cantrip\n\nAdd your Charisma modifier to the damage.');
    expect(await invocation('Armor of Shadows')).toBe('You can cast mage armor on yourself at will.');
    expect(await invocation('Eldritch Invocation: Ascendant Step')).toBe('Prerequisite: 9th level\n\nYou can cast levitate on yourself at will.');
  });

  it('leaves a feature whole when its parts are not a choice', async () => {
    const text = (await lookupFeatureFromJson(http, { name: 'Ki' }, context('Monk', 5, ['Ki', 'Flurry of Blows'])))?.description;

    expect(text).toContain('### Flurry of Blows');
    expect(text).toContain('### Patient Defense');
  });
});

describe('nameParts', () => {
  it('splits a feature name into the feature and its options', () => {
    expect(nameParts('Metamagic (Quickened Spell, Twinned Spell)')).toEqual(['metamagic', 'quickened spell', 'twinned spell']);
    expect(nameParts('Fighting Style: Two-Weapon Fighting')).toEqual(['fighting style', 'two-weapon fighting']);
    expect(nameParts('Unarmored Defense')).toEqual(['unarmored defense']);
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
