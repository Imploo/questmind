import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { PDFDocument, PDFFont, PDFForm, PDFPage } from 'pdf-lib';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { DndCharacter } from '../models/dnd-character.model';
import { InventoryItem } from '../models/character-play-state.model';
import {
  CHARACTER_IMAGE_FIELD,
  CHARACTER_SHEET_TEMPLATE_URL,
  MULTILINE_FIELDS,
  TEXT_FIELDS,
} from '../pdf/character-sheet-template';
import { buildSheetFieldValues, SheetFeature, SheetSpell } from '../pdf/character-sheet-field-values';
import * as logger from '../logger';

/** A multi-line field whose text did not fit, so the appendix repeats it in full. */
export interface OverflowSection {
  title: string;
  text: string;
}

const MAX_FONT_SIZE = 9;
const MIN_FONT_SIZE = 5;
const SINGLE_LINE_MAX_FONT_SIZE = 12;
const LINE_HEIGHT = 1.2;
const FIELD_PADDING = 4;

/**
 * The share panel: a QR code with a caption in the bottom of page 1's "Features & Traits"
 * box. It is the one box on that page with room to spare (the feature names are short and
 * their texts are in the appendix), and the outer corner of the sheet is easy to scan.
 */
const SHARE_PANEL_HEIGHT = 66;
/** 52pt is 18mm: modules of about half a millimetre, which a phone reads from a home print. */
const SHARE_CODE_SIZE = 52;
const SHARE_CODE_MARGIN = 4;
const SHARE_PANEL_TITLE = 'OPEN IN QUESTMIND';
const SHARE_PANEL_TEXT = 'Scan to view this character in the app. Clone it to your own account to use it in play mode.';

const OVERFLOW_TITLES: Record<string, string> = {
  [TEXT_FIELDS.backstory]: 'Appearance & Backstory',
  [TEXT_FIELDS.equipment]: 'Equipment',
  [TEXT_FIELDS.proficienciesAndLanguages]: 'Proficiencies & Languages',
  [TEXT_FIELDS.attacksAndSpellcasting]: 'Attacks & Spellcasting',
  [TEXT_FIELDS.personalityTraits]: 'Personality Traits',
  [TEXT_FIELDS.ideals]: 'Ideals',
  [TEXT_FIELDS.bonds]: 'Bonds',
  [TEXT_FIELDS.flaws]: 'Flaws',
};

/** Characters outside WinAnsi that AI text often contains, with a close WinAnsi equivalent. */
const CHAR_REPLACEMENTS: Record<string, string> = {
  '−': '-', '‐': '-', '‑': '-', '‒': '-', '―': '-',
  '→': '->', '←': '<-', '≤': '<=', '≥': '>=', '≈': '~',
  ' ': ' ', ' ': ' ', ' ': ' ', '​': '',
};

/**
 * Exports a character on the official, form-fillable D&D 5e character sheet
 * (three pages), followed by appendix pages with the full text of every
 * feature, trait and spell.
 */
@Injectable({ providedIn: 'root' })
export class PdfGeneratorService {
  private readonly http = inject(HttpClient);

  /**
   * `inventory`: items the player keeps by hand; those with a description are described in the appendix.
   * `portraitUrl`: the picture for the "Character Appearance" box on page 2.
   * `shareUrl`: the character's share link; page 1 gets a QR code that opens it.
   */
  async generateCharacterPdf(
    character: DndCharacter,
    spells: SheetSpell[],
    features: SheetFeature[],
    inventory: InventoryItem[] = [],
    portraitUrl: string | null = null,
    shareUrl: string | null = null
  ): Promise<void> {
    const bytes = await this.buildCharacterPdf(character, spells, features, inventory, portraitUrl, shareUrl);
    this.download(bytes, `${character.name} - Character Sheet.pdf`);
  }

  async buildCharacterPdf(
    character: DndCharacter,
    spells: SheetSpell[],
    features: SheetFeature[],
    inventory: InventoryItem[] = [],
    portraitUrl: string | null = null,
    shareUrl: string | null = null
  ): Promise<Uint8Array> {
    const { PDFDocument, PDFTextField, PDFCheckBox, StandardFonts } = await import('pdf-lib');
    const template = await firstValueFrom(this.http.get(CHARACTER_SHEET_TEMPLATE_URL, { responseType: 'arraybuffer' }));
    const doc = await PDFDocument.load(template);
    const form = doc.getForm();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const sanitize = createSanitizer(font);
    // Before the fields are filled: the panel takes room from a field, whose text must fit what is left.
    if (shareUrl) await this.placeShareCode(doc, form, font, shareUrl);

    const values = buildSheetFieldValues(character, spells, features);
    const overflow: OverflowSection[] = [];

    for (const [name, value] of Object.entries(values.text)) {
      const field = form.getFieldMaybe(name);
      if (!(field instanceof PDFTextField)) {
        logger.warn(`Character sheet template has no text field "${name}"`);
        continue;
      }
      const text = sanitize(value);
      field.setText(text);
      const rect = field.acroField.getWidgets()[0].getRectangle();
      // The template's fields inherit the form-wide /DA ("auto" size, which clips narrow boxes);
      // give each field its own so an explicit, fitting size can be set.
      field.acroField.setDefaultAppearance('/Helv 0 Tf 0 g');
      if (MULTILINE_FIELDS.includes(name)) {
        const size = fitFontSize(text, font, rect.width - FIELD_PADDING, rect.height - FIELD_PADDING);
        field.setFontSize(size ?? MIN_FONT_SIZE);
        if (size === null && OVERFLOW_TITLES[name]) {
          overflow.push({ title: OVERFLOW_TITLES[name], text: value });
        }
      } else {
        field.setFontSize(fitSingleLineFontSize(text, font, rect.width - FIELD_PADDING, rect.height));
      }
    }
    for (const name of values.checked) {
      const field = form.getFieldMaybe(name);
      if (field instanceof PDFCheckBox) field.check();
    }
    form.updateFieldAppearances(font);
    if (portraitUrl) await this.placePortrait(doc, form, portraitUrl);

    const appendix = this.buildAppendixDefinition(character, spells, features, overflow, inventory);
    if (appendix) {
      const appendixDoc = await PDFDocument.load(await this.renderWithPdfMake(appendix));
      const pages = await doc.copyPages(appendixDoc, appendixDoc.getPageIndices());
      pages.forEach(page => doc.addPage(page));
    }

    return doc.save();
  }

  /** Best-effort: a portrait that cannot be loaded or embedded must not block the download. */
  private async placePortrait(doc: PDFDocument, form: PDFForm, url: string): Promise<void> {
    try {
      const bytes = new Uint8Array(await firstValueFrom(this.http.get(url, { responseType: 'arraybuffer' })));
      const format = imageFormat(bytes);
      if (!format) {
        logger.warn('Character portrait is neither PNG nor JPEG; the sheet is exported without it');
        return;
      }
      const image = format === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const field = form.getButton(CHARACTER_IMAGE_FIELD);
      const widget = field.acroField.getWidgets()[0];
      const box = widget.getRectangle();
      const page = doc.getPages().find(p => p.ref === widget.P());
      if (!page) throw new Error(`"${CHARACTER_IMAGE_FIELD}" is not on a page`);
      // Drawn on the page instead of set on the field: viewers that highlight form fields
      // would otherwise colour the box around the picture. The field makes way for it.
      form.removeField(field);
      const size = image.scaleToFit(box.width, box.height);
      page.drawImage(image, {
        x: box.x + (box.width - size.width) / 2,
        y: box.y + (box.height - size.height) / 2,
        width: size.width,
        height: size.height,
      });
    } catch (e) {
      logger.warn('Could not place the character portrait on the sheet:', e);
    }
  }

  /** Best-effort: a sheet without the QR code is still a complete sheet. */
  private async placeShareCode(doc: PDFDocument, form: PDFForm, font: PDFFont, url: string): Promise<void> {
    try {
      const { PDFString, StandardFonts, rgb } = await import('pdf-lib');
      const qrcode = (await import('qrcode-generator')).default;
      const code = qrcode(0, 'M');
      code.addData(url);
      code.make();

      const widget = form.getTextField(TEXT_FIELDS.featuresAndTraits).acroField.getWidgets()[0];
      const box = widget.getRectangle();
      const page = doc.getPages().find(p => p.ref === widget.P());
      if (!page) throw new Error(`"${TEXT_FIELDS.featuresAndTraits}" is not on a page`);
      const bold = await doc.embedFont(StandardFonts.HelveticaBold);
      // The field makes way: a viewer draws a field over the page, and typed text must not run into the code.
      widget.setRectangle({ ...box, y: box.y + SHARE_PANEL_HEIGHT, height: box.height - SHARE_PANEL_HEIGHT });

      const left = box.x + FIELD_PADDING / 2;
      const right = box.x + box.width - FIELD_PADDING / 2;
      const codeX = right - SHARE_CODE_SIZE;
      const codeY = box.y + SHARE_CODE_MARGIN;
      const ruleY = box.y + SHARE_PANEL_HEIGHT - SHARE_CODE_MARGIN;
      page.drawLine({ start: { x: left, y: ruleY }, end: { x: right, y: ruleY }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
      // One path for all modules: separate squares would show hairlines between them in some viewers.
      page.drawSvgPath(qrModulesPath(code.getModuleCount(), (row, col) => code.isDark(row, col)), {
        x: codeX,
        y: codeY + SHARE_CODE_SIZE,
        scale: SHARE_CODE_SIZE / code.getModuleCount(),
        color: rgb(0, 0, 0),
        borderWidth: 0,
      });
      this.drawShareCaption(page, font, bold, left, codeX - 2 * SHARE_CODE_MARGIN - left, codeY + SHARE_CODE_SIZE / 2);

      // On a screen there is nothing to scan with, so the panel is also a link.
      const link = doc.context.register(doc.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [left, codeY, right, codeY + SHARE_CODE_SIZE],
        Border: [0, 0, 0],
        A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
      }));
      page.node.addAnnot(link);
    } catch (e) {
      logger.warn('Could not place the share QR code on the sheet:', e);
    }
  }

  /** Title and explanation left of the code, centred on `centerY`. */
  private drawShareCaption(page: PDFPage, font: PDFFont, bold: PDFFont, x: number, width: number, centerY: number): void {
    const titleSize = 7;
    const textSize = 6.5;
    const lineHeight = 8;
    const lines = wrapText(SHARE_PANEL_TEXT, font, textSize, width);
    const top = centerY + (titleSize + 3 + lines.length * lineHeight) / 2;
    page.drawText(SHARE_PANEL_TITLE, { x, y: top - titleSize, size: titleSize, font: bold });
    lines.forEach((line, i) => {
      page.drawText(line, { x, y: top - titleSize - 3 - (i + 1) * lineHeight + 1.5, size: textSize, font, opacity: 0.7 });
    });
  }

  /** Exposed for testing. Returns null when there is nothing to describe. */
  buildAppendixDefinition(
    character: DndCharacter,
    spells: SheetSpell[],
    features: SheetFeature[],
    overflow: OverflowSection[] = [],
    inventory: InventoryItem[] = []
  ): TDocumentDefinitions | null {
    const content: Content[] = [];

    if (features.length) {
      content.push({ text: 'Features & Traits', style: 'sectionTitle' });
      for (const feature of features) {
        content.push(this.buildEntry(feature.name, feature.source, [], feature.description));
      }
    }

    if (spells.length) {
      content.push({ text: 'Spells', style: 'sectionTitle', pageBreak: features.length ? 'before' : undefined });
      for (const group of groupSpellsByLevel(spells)) {
        const entries = group.spells.map(spell => {
          const meta = [spellLevelLabel(spell.level), capitalize(spell.school)].filter(Boolean).join(' • ');
          return this.buildEntry(spell.name, meta, spell.usage?.split('\n') ?? [], spell.description);
        });
        // Keep the level heading on the same page as its first spell.
        content.push({ stack: [{ text: group.title, style: 'groupTitle' }, entries[0]], unbreakable: true }, ...entries.slice(1));
      }
    }

    // Every item is already a line in the Equipment box; only the ones with a text get an entry here.
    const describedItems = inventory.filter(item => item.description);
    if (describedItems.length) {
      content.push({ text: 'Inventory', style: 'sectionTitle', margin: [0, content.length ? 12 : 0, 0, 8] });
      for (const item of describedItems) {
        content.push(this.buildEntry(item.name, item.value || undefined, [], item.description));
      }
    }

    if (overflow.length) {
      content.push({ text: 'Notes (continued from the sheet)', style: 'sectionTitle', pageBreak: content.length ? 'before' : undefined });
      for (const section of overflow) {
        content.push(this.buildEntry(section.title, undefined, [], section.text));
      }
    }

    if (!content.length) return null;

    return {
      pageSize: 'LETTER',
      pageMargins: [40, 50, 40, 40],
      header: (currentPage: number) => ({
        text: `${character.name} — ${character.class} ${character.level} — Reference (${currentPage})`,
        style: 'pageHeader',
        margin: [40, 20, 40, 0],
      }),
      content,
      styles: {
        pageHeader: { fontSize: 8, color: '#777' },
        sectionTitle: { fontSize: 16, bold: true, margin: [0, 0, 0, 8] },
        groupTitle: { fontSize: 12, bold: true, color: '#7a1f1f', margin: [0, 8, 0, 4] },
        entryName: { fontSize: 10, bold: true },
        entryMeta: { fontSize: 8, italics: true, color: '#666' },
        usage: { fontSize: 8, color: '#333' },
        body: { fontSize: 9, lineHeight: 1.15 },
        missing: { fontSize: 8, italics: true, color: '#999' },
      },
      defaultStyle: { font: 'Roboto', fontSize: 9 },
    };
  }

  private buildEntry(name: string, meta: string | undefined, usageLines: string[], description: string | undefined): Content {
    const stack: Content[] = [{ text: name, style: 'entryName' }];
    if (meta) stack.push({ text: meta, style: 'entryMeta' });
    if (usageLines.length) {
      stack.push({ stack: usageLines.map(line => boldLabel(line)), style: 'usage', margin: [0, 2, 0, 2] });
    }
    stack.push(description
      ? { text: toPlainText(description), style: 'body' }
      : { text: 'No description available.', style: 'missing' });
    return { stack, margin: [0, 0, 0, 10], unbreakable: !description || description.length < 600 };
  }

  private async renderWithPdfMake(definition: TDocumentDefinitions): Promise<ArrayBuffer> {
    const pdfMakeModule = await import('pdfmake/build/pdfmake');
    const pdfFontsModule: Record<string, unknown> = await import('pdfmake/build/vfs_fonts');
    const pdfMake = pdfMakeModule.default || pdfMakeModule;
    const pdfFonts = (pdfFontsModule['default'] || pdfFontsModule) as Record<string, unknown>;
    const vfs = (pdfFonts['pdfMake'] as Record<string, unknown>)?.['vfs'] ?? pdfFonts['vfs'] ?? pdfFonts;
    (pdfMake as unknown as Record<string, unknown>)['vfs'] = vfs;
    const blob = await pdfMake.createPdf(definition).getBlob();
    return blob.arrayBuffer();
  }

  private download(bytes: Uint8Array, fileName: string): void {
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** The two formats pdf-lib can embed, told apart by their first bytes (the stored MIME type is not always right). */
function imageFormat(bytes: Uint8Array): 'png' | 'jpg' | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  return null;
}

/**
 * The dark modules of a QR code as one SVG path on a grid of 1x1 modules, origin top left.
 * Neighbours in a row are joined into one rectangle.
 */
export function qrModulesPath(size: number, isDark: (row: number, col: number) => boolean): string {
  const parts: string[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!isDark(row, col)) continue;
      const start = col;
      while (col + 1 < size && isDark(row, col + 1)) col++;
      const run = col - start + 1;
      parts.push(`M${start} ${row}h${run}v1h${-run}z`);
    }
  }
  return parts.join('');
}

/** The template's fields use Helvetica (WinAnsi); map or drop anything it cannot encode. */
function createSanitizer(font: PDFFont): (text: string) => string {
  const supported = new Set(font.getCharacterSet());
  return text => Array.from(text.normalize('NFC'))
    .map(ch => CHAR_REPLACEMENTS[ch] ?? ch)
    .join('')
    .split('')
    .filter(ch => ch === '\n' || supported.has(ch.codePointAt(0) ?? 0))
    .join('');
}

/** Largest size up to SINGLE_LINE_MAX_FONT_SIZE that fits the box height and keeps the text within its width. */
export function fitSingleLineFontSize(text: string, font: PDFFont, width: number, height: number): number {
  let size = Math.max(MIN_FONT_SIZE, Math.min(SINGLE_LINE_MAX_FONT_SIZE, height - 2));
  while (size > MIN_FONT_SIZE && font.widthOfTextAtSize(text, size) > width) size -= 0.5;
  return size;
}

/** Largest font size (MAX..MIN) at which `text` wraps inside the box, or null if even MIN overflows. */
export function fitFontSize(text: string, font: PDFFont, width: number, height: number): number | null {
  for (let size = MAX_FONT_SIZE; size >= MIN_FONT_SIZE; size -= 0.5) {
    if (countWrappedLines(text, font, size, width) * size * LINE_HEIGHT <= height) return size;
  }
  return null;
}

function countWrappedLines(text: string, font: PDFFont, size: number, width: number): number {
  return wrapText(text, font, size, width).length;
}

/** The lines of `text` when it wraps at word boundaries within `width`. */
function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let current = '';
    for (const word of paragraph.split(' ')) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && font.widthOfTextAtSize(candidate, size) > width) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  return lines;
}

function groupSpellsByLevel(spells: SheetSpell[]): { title: string; spells: SheetSpell[] }[] {
  const groups: { title: string; spells: SheetSpell[] }[] = [];
  for (let level = 0; level <= 9; level++) {
    const atLevel = spells.filter(s => s.level === level);
    if (atLevel.length) groups.push({ title: level === 0 ? 'Cantrips' : `Level ${level}`, spells: atLevel });
  }
  const other = spells.filter(s => s.level === undefined || s.level < 0 || s.level > 9);
  if (other.length) groups.push({ title: 'Other spells', spells: other });
  return groups;
}

function spellLevelLabel(level: number | undefined): string {
  if (level === undefined) return '';
  return level === 0 ? 'Cantrip' : `Level ${level}`;
}

function capitalize(value: string | undefined): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

/** "Casting Time: 1 action" -> label in bold. */
function boldLabel(line: string): Content {
  const idx = line.indexOf(':');
  if (idx <= 0) return { text: line };
  return { text: [{ text: line.slice(0, idx + 1), bold: true }, line.slice(idx + 1)] };
}

/** Strip the light markdown used in the SRD data and AI output. */
export function toPlainText(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*(\n|$)/gm, '')
    .replace(/^[ \t]*\|(.*)\|[ \t]*$/gm, (_, row: string) => row.split('|').map(cell => cell.trim()).join('   '))
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1$2')
    .replace(/(^|[^_\w])_(?!\s)([^_\n]+?)_(?!\w)/g, '$1$2')
    .replace(/^[ \t]*[*-][ \t]+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
