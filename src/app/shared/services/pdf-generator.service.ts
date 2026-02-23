import { Injectable } from '@angular/core';
import { DndCharacter, SpellSlot } from '../models/dnd-character.model';
import type { TDocumentDefinitions, Content, ContentColumns, ContentTable, TableCell } from 'pdfmake/interfaces';

@Injectable({ providedIn: 'root' })
export class PdfGeneratorService {

  async generateCharacterPdf(character: DndCharacter): Promise<void> {
    const pdfMake = await import('pdfmake/build/pdfmake');
    const docDefinition = this.buildDocDefinition(character);
    pdfMake.createPdf(docDefinition).download(`${character.name} - Character Sheet.pdf`);
  }

  /** Exposed for testing */
  buildDocDefinition(character: DndCharacter): TDocumentDefinitions {
    return {
      pageSize: 'A4',
      pageMargins: [30, 30, 30, 30],
      content: [
        this.buildHeader(character),
        this.buildQuickStats(character),
        this.buildAbilityScores(character),
        this.buildMainContent(character),
        ...this.buildFullWidthSections(character),
      ],
      styles: {
        title: { fontSize: 22, bold: true, margin: [0, 0, 0, 2] },
        subtitle: { fontSize: 11, color: '#666', margin: [0, 0, 0, 6] },
        sectionHeader: { fontSize: 11, bold: true, margin: [0, 10, 0, 4], decoration: 'underline' as const },
        small: { fontSize: 8, color: '#666' },
      },
      defaultStyle: {
        fontSize: 9,
        font: 'Roboto',
      },
    };
  }

  private buildHeader(c: DndCharacter): Content {
    const lines: Content[] = [
      { text: c.name, style: 'title' },
      { text: `${c.race} ${c.class} (Level ${c.level})`, style: 'subtitle' },
    ];
    const details: string[] = [];
    if (c.background) details.push(c.background);
    if (c.alignment) details.push(c.alignment);
    if (details.length) {
      lines.push({ text: details.join(' \u2022 '), style: 'small' });
    }
    if (c.playerName) {
      lines.push({ text: `Player: ${c.playerName}`, style: 'small' });
    }
    if (c.experiencePoints) {
      lines.push({ text: `XP: ${c.experiencePoints}`, style: 'small' });
    }
    return { stack: lines, margin: [0, 0, 0, 10] as [number, number, number, number] };
  }

  private buildQuickStats(c: DndCharacter): Content {
    const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
    return {
      table: {
        widths: ['*', '*', '*', '*', '*'],
        body: [
          [
            { text: 'AC', bold: true, alignment: 'center' as const },
            { text: 'HP', bold: true, alignment: 'center' as const },
            { text: 'Initiative', bold: true, alignment: 'center' as const },
            { text: 'Speed', bold: true, alignment: 'center' as const },
            { text: 'Hit Dice', bold: true, alignment: 'center' as const },
          ],
          [
            { text: `${c.armorClass}`, alignment: 'center' as const },
            { text: `${c.hitPoints.current}/${c.hitPoints.max}`, alignment: 'center' as const },
            { text: fmt(c.initiative), alignment: 'center' as const },
            { text: `${c.speed} ft`, alignment: 'center' as const },
            { text: `${c.hitDice.current}/${c.hitDice.total}${c.hitDice.die}`, alignment: 'center' as const },
          ],
        ],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 10] as [number, number, number, number],
    } satisfies ContentTable;
  }

  private buildAbilityScores(c: DndCharacter): Content {
    const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
    const abilities = [
      { label: 'STR', ...c.abilities.strength },
      { label: 'DEX', ...c.abilities.dexterity },
      { label: 'CON', ...c.abilities.constitution },
      { label: 'INT', ...c.abilities.intelligence },
      { label: 'WIS', ...c.abilities.wisdom },
      { label: 'CHA', ...c.abilities.charisma },
    ];

    return {
      table: {
        widths: ['*', '*', '*', '*', '*', '*'],
        body: [
          abilities.map(a => ({ text: a.label, bold: true, alignment: 'center' as const, fontSize: 8 })),
          abilities.map(a => ({ text: `${a.score}`, alignment: 'center' as const, fontSize: 14, bold: true })),
          abilities.map(a => ({ text: fmt(a.modifier), alignment: 'center' as const, fontSize: 8, color: '#555' })),
        ],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0.5,
        vLineColor: () => '#ddd',
        paddingTop: () => 4,
        paddingBottom: () => 2,
      },
      margin: [0, 0, 0, 10] as [number, number, number, number],
    };
  }

  private buildMainContent(c: DndCharacter): Content {
    return {
      columns: [
        { width: '*', stack: this.buildLeftColumn(c) },
        { width: 15, text: '' },
        { width: '*', stack: this.buildRightColumn(c) },
      ],
      margin: [0, 0, 0, 6] as [number, number, number, number],
    } satisfies ContentColumns;
  }

  private buildLeftColumn(c: DndCharacter): Content[] {
    const content: Content[] = [];

    // Skills
    content.push({ text: 'SKILLS', style: 'sectionHeader' });
    const skillRows = this.getAllSkills(c).map(s => [
      { text: `${s.proficient ? '\u25CF' : '\u25CB'} ${s.name}`, fontSize: 8 },
      { text: s.modifier >= 0 ? `+${s.modifier}` : `${s.modifier}`, alignment: 'right' as const, fontSize: 8 },
    ]);
    content.push({
      table: { widths: ['*', 'auto'], body: skillRows },
      layout: 'noBorders',
    } satisfies ContentTable);

    // Saving Throws
    content.push({ text: 'SAVING THROWS', style: 'sectionHeader' });
    const stEntries = [
      { label: 'STR', ...c.savingThrows.strength },
      { label: 'DEX', ...c.savingThrows.dexterity },
      { label: 'CON', ...c.savingThrows.constitution },
      { label: 'INT', ...c.savingThrows.intelligence },
      { label: 'WIS', ...c.savingThrows.wisdom },
      { label: 'CHA', ...c.savingThrows.charisma },
    ];
    const stRows = stEntries.map(st => [
      { text: `${st.proficient ? '\u25CF' : '\u25CB'} ${st.label}`, fontSize: 8 },
      { text: st.modifier >= 0 ? `+${st.modifier}` : `${st.modifier}`, alignment: 'right' as const, fontSize: 8 },
    ]);
    content.push({
      table: { widths: ['*', 'auto'], body: stRows },
      layout: 'noBorders',
    } satisfies ContentTable);
    content.push({ text: `Passive Wisdom: ${c.passiveWisdom}`, fontSize: 8, bold: true, margin: [0, 2, 0, 0] as [number, number, number, number] });

    // Proficiencies & Languages
    content.push({ text: 'PROFICIENCIES & LANGUAGES', style: 'sectionHeader' });
    if (c.proficiencies.length) {
      content.push({ ul: c.proficiencies, fontSize: 8, margin: [0, 0, 0, 4] as [number, number, number, number] });
    }
    if (c.languages.length) {
      content.push({ text: `Languages: ${c.languages.join(', ')}`, fontSize: 8, italics: true });
    }

    return content;
  }

  private buildRightColumn(c: DndCharacter): Content[] {
    const content: Content[] = [];

    // Attacks
    content.push({ text: 'ATTACKS', style: 'sectionHeader' });
    if (c.attacks.length) {
      const attackBody: TableCell[][] = [
        [
          { text: 'Name', bold: true, fontSize: 8 },
          { text: 'Bonus', bold: true, fontSize: 8 },
          { text: 'Damage', bold: true, fontSize: 8 },
        ],
        ...c.attacks.map(a => [
          { text: a.name, fontSize: 8 },
          { text: `${(a.bonus ?? 0) >= 0 ? '+' : ''}${a.bonus ?? 0}`, fontSize: 8 },
          { text: `${a.damage || ''} ${a.type || ''}`.trim(), fontSize: 8 },
        ]),
      ];
      content.push({
        table: { widths: ['*', 'auto', 'auto'], body: attackBody },
        layout: 'lightHorizontalLines',
      } satisfies ContentTable);
    } else {
      content.push({ text: 'No attacks configured', fontSize: 8, italics: true, color: '#999' });
    }

    // Spellcasting
    if (c.spellcasting) {
      content.push({ text: 'SPELLCASTING', style: 'sectionHeader' });
      const scDetails: string[] = [];
      if (c.spellcasting.spellSaveDc) scDetails.push(`Save DC: ${c.spellcasting.spellSaveDc}`);
      if (c.spellcasting.spellAttackBonus !== undefined) {
        const bonus = c.spellcasting.spellAttackBonus;
        scDetails.push(`Spell Attack: ${bonus >= 0 ? '+' : ''}${bonus}`);
      }
      if (scDetails.length) {
        content.push({ text: scDetails.join('  |  '), fontSize: 8, bold: true, margin: [0, 0, 0, 4] as [number, number, number, number] });
      }

      // Spell slots
      const slots = this.normalizeSpellSlots(c.spellcasting.slots);
      if (slots.length) {
        const slotRows: TableCell[][] = slots.map(s => [
          { text: `Level ${s.level}`, fontSize: 8 },
          { text: `${s.total - s.expended}/${s.total}`, alignment: 'right' as const, fontSize: 8 },
        ]);
        content.push({
          table: { widths: ['*', 'auto'], body: slotRows },
          layout: 'noBorders',
          margin: [0, 0, 0, 4] as [number, number, number, number],
        } satisfies ContentTable);
      }

      // Spells list
      if (c.spellcasting.spells?.length) {
        const spellNames = c.spellcasting.spells.map(s => typeof s === 'string' ? s : s.name);
        content.push({ ul: spellNames, fontSize: 8 });
      }
    }

    // Features & Traits
    content.push({ text: 'FEATURES & TRAITS', style: 'sectionHeader' });
    if (c.featuresAndTraits.length) {
      const featureItems: Content[] = c.featuresAndTraits.map(f => {
        if (typeof f === 'string') return { text: f, fontSize: 8, margin: [0, 0, 0, 2] as [number, number, number, number] };
        const stack: Content[] = [{ text: f.name, bold: true, fontSize: 8 }];
        if (f.description) stack.push({ text: f.description, fontSize: 7, color: '#555' });
        return { stack, margin: [0, 0, 0, 4] as [number, number, number, number] };
      });
      content.push({ stack: featureItems });
    } else {
      content.push({ text: 'No features yet', fontSize: 8, italics: true, color: '#999' });
    }

    return content;
  }

  private buildFullWidthSections(c: DndCharacter): Content[] {
    const sections: Content[] = [];

    // Equipment & Inventory
    sections.push({ text: 'INVENTORY', style: 'sectionHeader' });
    const coinText = `CP: ${c.coins.cp}  SP: ${c.coins.sp}  EP: ${c.coins.ep}  GP: ${c.coins.gp}  PP: ${c.coins.pp}`;
    sections.push({ text: coinText, fontSize: 8, bold: true, margin: [0, 0, 0, 4] as [number, number, number, number] });
    if (c.equipment.length) {
      sections.push({ ul: c.equipment, fontSize: 8 });
    }

    // Personality
    if (c.personalityTraits || c.ideals || c.bonds || c.flaws) {
      sections.push({ text: 'PERSONALITY', style: 'sectionHeader' });
      if (c.personalityTraits) sections.push({ text: `Traits: ${c.personalityTraits}`, fontSize: 8, margin: [0, 0, 0, 2] as [number, number, number, number] });
      if (c.ideals) sections.push({ text: `Ideals: ${c.ideals}`, fontSize: 8, margin: [0, 0, 0, 2] as [number, number, number, number] });
      if (c.bonds) sections.push({ text: `Bonds: ${c.bonds}`, fontSize: 8, margin: [0, 0, 0, 2] as [number, number, number, number] });
      if (c.flaws) sections.push({ text: `Flaws: ${c.flaws}`, fontSize: 8, margin: [0, 0, 0, 2] as [number, number, number, number] });
    }

    // Appearance
    if (c.appearance) {
      const details: string[] = [];
      if (c.appearance.age) details.push(`Age: ${c.appearance.age}`);
      if (c.appearance.height) details.push(`Height: ${c.appearance.height}`);
      if (c.appearance.weight) details.push(`Weight: ${c.appearance.weight}`);
      if (c.appearance.eyes) details.push(`Eyes: ${c.appearance.eyes}`);
      if (c.appearance.skin) details.push(`Skin: ${c.appearance.skin}`);
      if (c.appearance.hair) details.push(`Hair: ${c.appearance.hair}`);

      if (details.length || c.appearance.description) {
        sections.push({ text: 'APPEARANCE', style: 'sectionHeader' });
        if (details.length) sections.push({ text: details.join('  |  '), fontSize: 8, margin: [0, 0, 0, 2] as [number, number, number, number] });
        if (c.appearance.description) sections.push({ text: c.appearance.description, fontSize: 8 });
      }
    }

    // Backstory
    if (c.backstory) {
      sections.push({ text: 'BACKSTORY', style: 'sectionHeader' });
      sections.push({ text: c.backstory, fontSize: 8 });
    }

    return sections;
  }

  private getAllSkills(c: DndCharacter): { name: string; proficient: boolean; modifier: number }[] {
    const allDndSkills = [
      { name: 'Acrobatics', ability: 'dexterity' as const },
      { name: 'Animal Handling', ability: 'wisdom' as const },
      { name: 'Arcana', ability: 'intelligence' as const },
      { name: 'Athletics', ability: 'strength' as const },
      { name: 'Deception', ability: 'charisma' as const },
      { name: 'History', ability: 'intelligence' as const },
      { name: 'Insight', ability: 'wisdom' as const },
      { name: 'Intimidation', ability: 'charisma' as const },
      { name: 'Investigation', ability: 'intelligence' as const },
      { name: 'Medicine', ability: 'wisdom' as const },
      { name: 'Nature', ability: 'intelligence' as const },
      { name: 'Perception', ability: 'wisdom' as const },
      { name: 'Performance', ability: 'charisma' as const },
      { name: 'Persuasion', ability: 'charisma' as const },
      { name: 'Religion', ability: 'intelligence' as const },
      { name: 'Sleight of Hand', ability: 'dexterity' as const },
      { name: 'Stealth', ability: 'dexterity' as const },
      { name: 'Survival', ability: 'wisdom' as const },
    ];

    return allDndSkills.map(skill => {
      const charSkill = c.skills.find(s => s.name === skill.name);
      if (charSkill) return charSkill;
      return { name: skill.name, proficient: false, modifier: c.abilities[skill.ability].modifier };
    });
  }

  private normalizeSpellSlots(slots: SpellSlot[] | Record<string, unknown> | undefined): SpellSlot[] {
    if (!slots) return [];
    if (Array.isArray(slots)) return [...slots].sort((a, b) => a.level - b.level);
    return Object.entries(slots)
      .map(([level, data]) => {
        const slotData = data as { total?: number; expended?: number };
        return { level: parseInt(level), total: slotData.total || 0, expended: slotData.expended || 0 };
      })
      .sort((a, b) => a.level - b.level);
  }
}
