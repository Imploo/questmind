import type { Translations } from '../../core/i18n/translations';
import { WeaponAttack } from '../models/dnd-character.model';

/**
 * What is rolled for an attack, in a few characters: "+7" for an attack roll, "DC 15 DEX"
 * when the target makes a saving throw, and nothing when it simply hits (Magic Missile).
 * Game terms only, so it reads the same in every language; the PDF prints it too.
 */
export function attackRollLabel(attack: Pick<WeaponAttack, 'bonus' | 'save'>): string {
  if (attack.save) {
    const ability = attack.save.ability.slice(0, 3).toUpperCase();
    return attack.save.dc === undefined ? `${ability} save` : `DC ${attack.save.dc} ${ability}`;
  }
  if (attack.bonus === undefined || attack.bonus === null) return '';
  return attack.bonus >= 0 ? `+${attack.bonus}` : `${attack.bonus}`;
}

/** The same in words, for a tooltip on the sheet. */
export function attackRollTitle(attack: Pick<WeaponAttack, 'bonus' | 'save'>, texts: Translations['sheet']['attackRoll']): string {
  if (!attack.save) return texts.attackBonus;
  const ability = attack.save.ability[0].toUpperCase() + attack.save.ability.slice(1);
  return texts.savingThrow(ability);
}
