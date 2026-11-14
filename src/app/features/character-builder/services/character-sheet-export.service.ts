import { inject, Injectable } from '@angular/core';
import { DndCharacter, Spell } from '../../../shared/models/dnd-character.model';
import { InventoryItem } from '../../../shared/models/character-play-state.model';
import { PdfGeneratorService } from '../../../shared/services/pdf-generator.service';
import { SheetFeature, SheetSpell } from '../../../shared/pdf/character-sheet-field-values';
import { CharacterEntryResolverService } from '../../../core/services/character-entry-resolver.service';
import { CharacterVersionService } from '../../../core/services/character-version.service';
import { characterShareUrl } from '../../../shared/utils/character-share-url';
import * as logger from '../../../shared/logger';

export interface CharacterSheetExportRequest {
  character: DndCharacter;
  characterId: string | null;
  versionId: string | null;
  /** Only owners may call the AI fallback and store what was looked up. */
  canResolveRemotely: boolean;
  /** Items the player keeps by hand; they are added to the equipment on the sheet. */
  inventory?: InventoryItem[];
  /** The character's portrait; it goes in the "Character Appearance" box. */
  portraitUrl?: string | null;
}

/** One equipment line for a hand-kept item: "Arrows (20)". */
function inventoryLine(item: InventoryItem): string {
  return item.value ? `${item.name} (${item.value})` : item.name;
}

/**
 * Exports a character as the official D&D 5e sheet. Before rendering it looks up
 * the rules text of every spell and feature that has none yet, so the appendix
 * can show what each one does, and stores those texts on the version in one write.
 */
@Injectable({ providedIn: 'root' })
export class CharacterSheetExportService {
  private readonly resolver = inject(CharacterEntryResolverService);
  private readonly versionService = inject(CharacterVersionService);
  private readonly pdfGenerator = inject(PdfGeneratorService);

  async export(request: CharacterSheetExportRequest): Promise<void> {
    const inventory = request.inventory ?? [];
    const character: DndCharacter = inventory.length
      ? { ...request.character, equipment: [...(request.character.equipment ?? []), ...inventory.map(inventoryLine)] }
      : request.character;
    const [spells, features] = await Promise.all([
      this.resolveSpells(request),
      this.resolveFeatures(request),
    ]);

    await this.persist(request, spells.resolved, features.resolved);
    await this.pdfGenerator.generateCharacterPdf(
      character,
      spells.entries,
      features.entries,
      inventory,
      request.portraitUrl ?? null,
      // A QR code on the sheet, so a player holding the print can open the character and clone it.
      request.characterId ? characterShareUrl(request.characterId) : null
    );
  }

  private async resolveSpells(
    request: CharacterSheetExportRequest
  ): Promise<{ entries: SheetSpell[]; resolved: Map<string, { description: string; usage: string }> }> {
    const resolved = new Map<string, { description: string; usage: string }>();
    const source: (string | Spell)[] = request.character.spellcasting?.spells ?? [];
    const entries = await Promise.all(
      source.map(async (raw): Promise<SheetSpell> => {
        const spell: SheetSpell = typeof raw === 'string' ? { name: raw } : { ...raw };
        try {
          if (spell.description && spell.level !== undefined) return spell;
          const details = spell.description
            ? await this.resolver.lookupSpellLocally(spell.name)
            : await this.resolveSpellDetails(request, spell);
          if (!details) return spell;
          if (!spell.description) {
            resolved.set(spell.name.toLowerCase(), { description: details.description, usage: details.usage });
          }
          return {
            ...spell,
            description: spell.description || details.description,
            usage: spell.usage || details.usage,
            level: spell.level ?? details.level,
            school: spell.school ?? details.school,
          };
        } catch (e) {
          logger.error(`Failed to resolve spell "${spell.name}" for PDF export:`, e);
          return spell;
        }
      })
    );
    return { entries, resolved };
  }

  private resolveSpellDetails(request: CharacterSheetExportRequest, spell: SheetSpell) {
    return request.canResolveRemotely
      ? this.resolver.resolveSpell(request.characterId, spell)
      : this.resolver.lookupSpellLocally(spell.name);
  }

  private async resolveFeatures(
    request: CharacterSheetExportRequest
  ): Promise<{ entries: SheetFeature[]; resolved: Map<string, { description: string }> }> {
    const resolved = new Map<string, { description: string }>();
    const source = (request.character.featuresAndTraits ?? []) as (string | SheetFeature)[];
    const entries = await Promise.all(
      source.map(async (raw): Promise<SheetFeature> => {
        const feature: SheetFeature = typeof raw === 'string' ? { name: raw } : { ...raw };
        if (feature.description) return feature;
        try {
          const details = request.canResolveRemotely
            ? await this.resolver.resolveFeature(request.characterId, feature, request.character)
            : await this.resolver.lookupFeatureLocally(feature.name);
          if (!details) return feature;
          resolved.set(feature.name.toLowerCase(), details);
          return { ...feature, description: details.description };
        } catch (e) {
          logger.error(`Failed to resolve feature "${feature.name}" for PDF export:`, e);
          return feature;
        }
      })
    );
    return { entries, resolved };
  }

  /** Best-effort: a failed write must not block the download. */
  private async persist(
    request: CharacterSheetExportRequest,
    spells: Map<string, { description: string; usage: string }>,
    features: Map<string, { description: string }>
  ): Promise<void> {
    if (!request.canResolveRemotely || !request.characterId || !request.versionId) return;
    try {
      await this.versionService.patchResolvedEntries(request.characterId, request.versionId, spells, features);
    } catch (e) {
      logger.error('Failed to store resolved spell/feature texts:', e);
    }
  }
}
