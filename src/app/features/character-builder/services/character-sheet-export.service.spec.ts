import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { CharacterSheetExportService, CharacterSheetExportRequest } from './character-sheet-export.service';
import { CharacterEntryResolverService } from '../../../core/services/character-entry-resolver.service';
import { CharacterVersionService } from '../../../core/services/character-version.service';
import { PdfGeneratorService } from '../../../shared/services/pdf-generator.service';
import { DndCharacter } from '../../../shared/models/dnd-character.model';
import { SheetFeature, SheetSpell } from '../../../shared/pdf/character-sheet-field-values';

function character(overrides: Partial<DndCharacter> = {}): DndCharacter {
  return {
    name: 'Hero', class: 'Wizard', level: 3, race: 'Elf', experiencePoints: 0,
    abilities: {} as DndCharacter['abilities'], skills: [], savingThrows: {} as DndCharacter['savingThrows'],
    passiveWisdom: 10, proficiencies: [], languages: [], armorClass: 10, initiative: 0, speed: 30,
    hitPoints: { max: 1, current: 1, temp: 0 }, hitDice: { total: 1, current: 1, die: 'd6' },
    deathSaves: { successes: 0, failures: 0 }, attacks: [], equipment: [],
    coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }, featuresAndTraits: [],
    ...overrides,
  };
}

describe('CharacterSheetExportService', () => {
  const resolver = {
    lookupSpellLocally: vi.fn(),
    lookupFeatureLocally: vi.fn(),
    resolveSpell: vi.fn(),
    resolveFeature: vi.fn(),
  };
  const versions = { patchResolvedEntries: vi.fn() };
  const pdf = { generateCharacterPdf: vi.fn() };
  let service: CharacterSheetExportService;

  const request = (c: DndCharacter, canResolveRemotely = true): CharacterSheetExportRequest =>
    ({ character: c, characterId: 'char-1', versionId: 'v-1', canResolveRemotely });
  const rendered = () => pdf.generateCharacterPdf.mock.calls[0] as [DndCharacter, SheetSpell[], SheetFeature[]];

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: CharacterEntryResolverService, useValue: resolver },
        { provide: CharacterVersionService, useValue: versions },
        { provide: PdfGeneratorService, useValue: pdf },
      ],
    });
    service = TestBed.inject(CharacterSheetExportService);
  });

  it('adds hand-kept inventory items to the equipment and passes them on', async () => {
    const inventory = [
      { id: 'a', name: 'Arrows', value: '20', description: '' },
      { id: 'b', name: 'Rope', value: '', description: 'Hempen.' },
    ];
    const c = character({ equipment: ['Quarterstaff'] });

    await service.export({ ...request(c), inventory });

    const call = pdf.generateCharacterPdf.mock.calls[0];
    expect(call[0].equipment).toEqual(['Quarterstaff', 'Arrows (20)', 'Rope']);
    expect(call[3]).toEqual(inventory);
    expect(c.equipment).toEqual(['Quarterstaff']);
  });

  it('leaves the equipment alone without inventory items', async () => {
    const c = character({ equipment: ['Quarterstaff'] });

    await service.export(request(c));

    expect(pdf.generateCharacterPdf.mock.calls[0][0]).toBe(c);
  });

  it('resolves missing texts, renders them and stores them in one write', async () => {
    resolver.resolveSpell.mockResolvedValue({ description: 'Darts.', usage: 'Casting Time: 1 action', level: 1, school: 'evocation' });
    resolver.resolveFeature.mockResolvedValue({ description: 'Regain slots.' });
    const c = character({
      spellcasting: { spells: [{ name: 'Magic Missile' }, 'Shield'] },
      featuresAndTraits: [{ name: 'Arcane Recovery' } as DndCharacter['featuresAndTraits'][number]],
    });
    resolver.resolveSpell.mockImplementation(async (_id: string, s: { name: string }) =>
      s.name === 'Shield'
        ? { description: 'Barrier.', usage: 'Casting Time: 1 reaction', level: 1 }
        : { description: 'Darts.', usage: 'Casting Time: 1 action', level: 1, school: 'evocation' });

    await service.export(request(c));

    const [, spells, features] = rendered();
    expect(spells).toEqual([
      { name: 'Magic Missile', description: 'Darts.', usage: 'Casting Time: 1 action', level: 1, school: 'evocation' },
      { name: 'Shield', description: 'Barrier.', usage: 'Casting Time: 1 reaction', level: 1, school: undefined },
    ]);
    expect(features).toEqual([{ name: 'Arcane Recovery', description: 'Regain slots.' }]);

    expect(versions.patchResolvedEntries).toHaveBeenCalledTimes(1);
    const [charId, versionId, spellMap, featureMap] = versions.patchResolvedEntries.mock.calls[0];
    expect([charId, versionId]).toEqual(['char-1', 'v-1']);
    expect([...spellMap.keys()]).toEqual(['magic missile', 'shield']);
    expect(featureMap.get('arcane recovery')).toEqual({ description: 'Regain slots.' });
  });

  it('still exports when a lookup fails', async () => {
    resolver.resolveSpell.mockRejectedValue(new Error('quota'));
    await service.export(request(character({ spellcasting: { spells: [{ name: 'Wish' }] } })));

    expect(rendered()[1]).toEqual([{ name: 'Wish' }]);
  });

  it('uses only the bundled data and stores nothing for non-owners', async () => {
    resolver.lookupSpellLocally.mockResolvedValue({ description: 'Darts.', usage: 'u', level: 1 });
    resolver.lookupFeatureLocally.mockResolvedValue(null);
    await service.export(request(character({
      spellcasting: { spells: [{ name: 'Magic Missile' }] },
      featuresAndTraits: [{ name: 'Homebrew' } as DndCharacter['featuresAndTraits'][number]],
    }), false));

    expect(resolver.resolveSpell).not.toHaveBeenCalled();
    expect(resolver.resolveFeature).not.toHaveBeenCalled();
    expect(versions.patchResolvedEntries).not.toHaveBeenCalled();
    expect(rendered()[1][0].description).toBe('Darts.');
    expect(rendered()[2]).toEqual([{ name: 'Homebrew' }]);
  });

  it('looks up only the level of a spell that already has a description', async () => {
    resolver.lookupSpellLocally.mockResolvedValue({ description: 'SRD text', usage: 'SRD usage', level: 3, school: 'evocation' });
    await service.export(request(character({ spellcasting: { spells: [{ name: 'Fireball', description: 'Own text' }] } })));

    expect(resolver.resolveSpell).not.toHaveBeenCalled();
    expect(rendered()[1][0]).toMatchObject({ description: 'Own text', level: 3 });
    const [, , spellMap] = versions.patchResolvedEntries.mock.calls[0];
    expect(spellMap.size).toBe(0);
  });
});
