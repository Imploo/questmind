import { inject, Injectable } from '@angular/core';
import { CharacterFeature, DndCharacter, Spell } from '../../../shared/models/dnd-character.model';
import { CustomFeat, InventoryItem } from '../../../shared/models/character-play-state.model';
import { PdfGeneratorService } from '../../../shared/services/pdf-generator.service';
import { SheetFeature, SheetSpell } from '../../../shared/pdf/character-sheet-field-values';
import { CharacterEntryResolverService } from '../../../core/services/character-entry-resolver.service';
import { CharacterVersionService, ResolvedFeatureText, ResolvedSpellText } from '../../../core/services/character-version.service';
import { ResolutionContext, resolutionContextOf, resolutionKey } from '../../../shared/utils/resolution-context';
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
  /** Feats the player wrote down by hand; they follow the features of the build on the sheet. */
  feats?: CustomFeat[];
  /** The character's portrait; it goes in the "Character Appearance" box. */
  portraitUrl?: string | null;
}

/** One equipment line for a hand-kept item: "Arrows (20)". */
function inventoryLine(item: InventoryItem): string {
  return item.value ? `${item.name} (${item.value})` : item.name;
}

/** A custom feat as a feature on the sheet. Its text is the player's own, so nothing is looked up for it. */
function featEntry(feat: CustomFeat): SheetFeature {
  return { name: feat.name, description: feat.description || undefined, source: 'Custom feat' };
}

/**
 * Exports a character as the official D&D 5e sheet. Before rendering it looks up
 * the rules text of every spell and feature that has none yet (or has one for another
 * class or level), so the appendix can show what each one does for this character,
 * and stores those texts on the version in one write.
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
    const context = resolutionContextOf(request.character);
    const [spells, features] = await Promise.all([
      this.resolveSpells(request, context),
      this.resolveFeatures(request, context),
    ]);

    await this.persist(request, spells.resolved, features.resolved);
    await this.pdfGenerator.generateCharacterPdf(
      character,
      spells.entries,
      [...features.entries, ...(request.feats ?? []).map(featEntry)],
      inventory,
      request.portraitUrl ?? null,
      // A QR code on the sheet, so a player holding the print can open the character and clone it.
      request.characterId ? characterShareUrl(request.characterId) : null
    );
  }

  private async resolveSpells(
    request: CharacterSheetExportRequest,
    context: ResolutionContext
  ): Promise<{ entries: SheetSpell[]; resolved: Map<string, ResolvedSpellText> }> {
    const resolved = new Map<string, ResolvedSpellText>();
    const source: (string | Spell)[] = request.character.spellcasting?.spells ?? [];
    const entries = await Promise.all(
      source.map(async (raw): Promise<SheetSpell> => {
        const spell: Spell = typeof raw === 'string' ? { name: raw } : { ...raw };
        try {
          const needsText = this.needsText(request, spell, context);
          if (!needsText && spell.level !== undefined) return spell;
          const details = needsText
            ? await this.resolveSpellDetails(request, spell, context)
            : await this.resolver.lookupSpellLocally(spell.name);
          if (!details) return spell;
          const text = needsText ? details : { description: spell.description, usage: spell.usage || details.usage };
          if (needsText) {
            resolved.set(spell.name.toLowerCase(), {
              description: details.description,
              usage: details.usage,
              resolvedFor: resolutionKey(context),
            });
          }
          return {
            ...spell,
            description: text.description,
            usage: text.usage,
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

  private resolveSpellDetails(request: CharacterSheetExportRequest, spell: SheetSpell, context: ResolutionContext) {
    return request.canResolveRemotely
      ? this.resolver.resolveSpell(request.characterId, spell, context)
      : this.resolver.lookupSpellLocally(spell.name, context);
  }

  private async resolveFeatures(
    request: CharacterSheetExportRequest,
    context: ResolutionContext
  ): Promise<{ entries: SheetFeature[]; resolved: Map<string, ResolvedFeatureText> }> {
    const resolved = new Map<string, ResolvedFeatureText>();
    const source = (request.character.featuresAndTraits ?? []) as (string | CharacterFeature)[];
    const entries = await Promise.all(
      source.map(async (raw): Promise<SheetFeature> => {
        const feature: Partial<CharacterFeature> & { name: string } = typeof raw === 'string' ? { name: raw } : { ...raw };
        if (!this.needsText(request, feature, context)) return feature;
        try {
          const details = request.canResolveRemotely
            ? await this.resolver.resolveFeature(request.characterId, feature, context)
            : await this.resolver.lookupFeatureLocally(feature, context);
          if (!details) return feature;
          resolved.set(feature.name.toLowerCase(), {
            description: details.description,
            resolvedFor: resolutionKey(context),
          });
          return { ...feature, description: details.description };
        } catch (e) {
          logger.error(`Failed to resolve feature "${feature.name}" for PDF export:`, e);
          return feature;
        }
      })
    );
    return { entries, resolved };
  }

  /**
   * An entry needs a text when it has none. The owner's export also redoes a text that
   * was looked up for another class, race or level, since the result can be stored.
   */
  private needsText(
    request: CharacterSheetExportRequest,
    entry: { description?: string; resolvedFor?: string },
    context: ResolutionContext
  ): boolean {
    if (!entry.description) return true;
    return request.canResolveRemotely && entry.resolvedFor !== resolutionKey(context);
  }

  /** Best-effort: a failed write must not block the download. */
  private async persist(
    request: CharacterSheetExportRequest,
    spells: Map<string, ResolvedSpellText>,
    features: Map<string, ResolvedFeatureText>
  ): Promise<void> {
    if (!request.canResolveRemotely || !request.characterId || !request.versionId) return;
    try {
      await this.versionService.patchResolvedEntries(request.characterId, request.versionId, spells, features);
    } catch (e) {
      logger.error('Failed to store resolved spell/feature texts:', e);
    }
  }
}
