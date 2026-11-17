import { describe, it, expect } from 'vitest';
import { attackRollLabel, attackRollTitle } from './attack-roll';
import { en } from '../../core/i18n/en';
import { nl } from '../../core/i18n/nl';

describe('attackRollLabel', () => {
  // The PDF prints this label too, so it is the same English text in every language.
  it('is the attack bonus with its sign', () => {
    expect(attackRollLabel({ bonus: 7 })).toBe('+7');
    expect(attackRollLabel({ bonus: 0 })).toBe('+0');
    expect(attackRollLabel({ bonus: -1 })).toBe('-1');
  });

  it('is the saving throw when the target makes one', () => {
    expect(attackRollLabel({ save: { ability: 'dexterity', dc: 15 } })).toBe('DC 15 DEX');
    expect(attackRollLabel({ save: { ability: 'constitution' } })).toBe('CON save');
  });

  it('is empty for an attack that simply hits', () => {
    expect(attackRollLabel({})).toBe('');
  });
});

describe('attackRollTitle', () => {
  it('names the attack bonus', () => {
    expect(attackRollTitle({ bonus: 7 }, en.sheet.attackRoll)).toBe(en.sheet.attackRoll.attackBonus);
    expect(attackRollTitle({}, nl.sheet.attackRoll)).toBe(nl.sheet.attackRoll.attackBonus);
  });

  it('says in the language of the user which saving throw the target makes, with the ability in English', () => {
    const attack = { save: { ability: 'constitution', dc: 14 } } as const;

    expect(attackRollTitle(attack, en.sheet.attackRoll)).toBe('The target makes a Constitution saving throw');
    expect(attackRollTitle(attack, nl.sheet.attackRoll)).toBe('Het doelwit maakt een Constitution saving throw');
  });
});
