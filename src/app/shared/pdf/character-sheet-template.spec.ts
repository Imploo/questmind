import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFCheckBox, PDFDocument, PDFForm, PDFTextField } from 'pdf-lib';
import {
  ABILITY_FIELDS,
  DEATH_SAVE_FAILURE_FIELDS,
  DEATH_SAVE_SUCCESS_FIELDS,
  MULTILINE_FIELDS,
  SKILL_FIELDS,
  SPELL_LEVEL_FIELDS,
  TEXT_FIELDS,
  WEAPON_FIELDS,
} from './character-sheet-template';

function readTemplateBytes(): Uint8Array {
  // Copy into this realm's Uint8Array; pdf-lib rejects Node's Buffer under jsdom.
  return Uint8Array.from(readFileSync('public/templates/dnd-5e-character-sheet.pdf'));
}

describe('character sheet template field map', () => {
  let form: PDFForm;

  beforeAll(async () => {
    form = (await PDFDocument.load(readTemplateBytes())).getForm();
  });

  const textFields = (): string[] => [
    ...Object.values(TEXT_FIELDS),
    ...Object.values(ABILITY_FIELDS).flatMap(a => [a.score, a.modifier, a.save]),
    ...SKILL_FIELDS.map(s => s.field),
    ...WEAPON_FIELDS.flatMap(w => [w.name, w.bonus, w.damage]),
    ...SPELL_LEVEL_FIELDS.flatMap(l => [...l.lines, l.slotsTotal, l.slotsExpended].filter((n): n is string => !!n)),
  ];

  const checkBoxes = (): string[] => [
    ...Object.values(ABILITY_FIELDS).map(a => a.saveProficient),
    ...SKILL_FIELDS.map(s => s.proficient),
    ...DEATH_SAVE_SUCCESS_FIELDS,
    ...DEATH_SAVE_FAILURE_FIELDS,
  ];

  it('names only text fields that exist in the template', () => {
    const missing = textFields().filter(name => !(form.getFieldMaybe(name) instanceof PDFTextField));
    expect(missing).toEqual([]);
  });

  it('names only checkboxes that exist in the template', () => {
    const missing = checkBoxes().filter(name => !(form.getFieldMaybe(name) instanceof PDFCheckBox));
    expect(missing).toEqual([]);
  });

  it('uses every field at most once', () => {
    const all = [...textFields(), ...checkBoxes()];
    expect(new Set(all).size).toBe(all.length);
  });

  it('marks only multi-line template fields as multi-line', () => {
    expect(MULTILINE_FIELDS.filter(name => !form.getTextField(name).isMultiline())).toEqual([]);
  });

  it('lists the spell lines of each level top to bottom', () => {
    for (const level of SPELL_LEVEL_FIELDS) {
      const ys = level.lines.map(name => form.getTextField(name).acroField.getWidgets()[0].getRectangle().y);
      expect(ys).toEqual([...ys].sort((a, b) => b - a));
    }
  });

  it('lists the skill boxes top to bottom, next to their modifier field', () => {
    for (const skill of SKILL_FIELDS) {
      const boxY = form.getCheckBox(skill.proficient).acroField.getWidgets()[0].getRectangle().y;
      const fieldY = form.getTextField(skill.field).acroField.getWidgets()[0].getRectangle().y;
      expect(Math.abs(boxY - fieldY)).toBeLessThan(4);
    }
  });
});
