import { describe, it, expect } from 'vitest';
import { sectionInView } from './sheet-section-tabs.component';

describe('sectionInView', () => {
  /** A sheet scrolled so that its sections start at these distances from the top of the view. */
  const sections = (abilities: number, attacks: number, spells: number, inventory: number) => [
    { id: 'abilities', top: abilities },
    { id: 'attacks', top: attacks },
    { id: 'spells', top: spells },
    { id: 'inventory', top: inventory },
  ];
  const view = { top: 0, atEnd: false };

  it('is none while the first section is still below the reading line', () => {
    expect(sectionInView(sections(500, 900, 1400, 2000), view, 2400)).toBeNull();
  });

  it('is the last section whose top has passed the reading line', () => {
    expect(sectionInView(sections(-400, 16, 516, 1116), view, 1516)).toBe('attacks');
    expect(sectionInView(sections(-900, -484, 16, 616), view, 1016)).toBe('spells');
  });

  it('keeps to the first of two sections that stand side by side until the second reaches the line', () => {
    expect(sectionInView(sections(16, 145, 700, 1300), view, 1700)).toBe('abilities');
    expect(sectionInView(sections(-113, 16, 571, 1171), view, 1571)).toBe('attacks');
  });

  it('measures from the top of the panel the sheet scrolls in', () => {
    expect(sectionInView(sections(-340, 76, 576, 1176), { top: 56, atEnd: false }, 1576)).toBe('attacks');
    expect(sectionInView(sections(-340, 160, 576, 1176), { top: 56, atEnd: false }, 1576)).toBe('abilities');
  });

  it('is the last section at the very end, where a short one cannot reach the line', () => {
    expect(sectionInView(sections(-1500, -1100, -600, 300), { top: 0, atEnd: true }, null)).toBe('inventory');
  });

  it('is none once what follows the sections has passed the line, also at the very end', () => {
    expect(sectionInView(sections(-2000, -1600, -1100, -500), view, 40)).toBeNull();
    expect(sectionInView(sections(-2000, -1600, -1100, -500), { top: 0, atEnd: true }, 40)).toBeNull();
  });

  it('is none for a sheet without sections', () => {
    expect(sectionInView([], { top: 0, atEnd: true }, null)).toBeNull();
  });
});
