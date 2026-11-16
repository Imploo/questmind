import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { tailorToLevel } from './level-tailoring';
import { ResolutionContext } from './resolution-context';

export interface FeatureDetails {
  description: string;
}

export interface FeatureToLookUp {
  name: string;
  /** "Race", "Class", "Subclass", "Background", "Feat" or "Other". */
  source?: string;
}

interface ClassFeatureJsonFields {
  name: string;
  desc: string;
  /** The class or subclass the feature belongs to: "srd_druid", "srd_circle-of-the-land". */
  parent: string;
  document: string;
  feature_type?: string;
}

interface ClassFeatureJsonEntry {
  fields: ClassFeatureJsonFields;
}

/** One class's or subclass's text for a feature name; "Spellcasting" has seven of them. */
interface FeatureVariant {
  class: string;
  /** Set when the feature comes from a subclass: "circle of the land". */
  subclass?: string;
  description: string;
  /** The entry is nothing but the options of another feature (the eldritch invocations). */
  isOptionList: boolean;
}

/** One option of a feature with a choice: a Metamagic option, a fighting style. */
interface FeatureOption {
  /** Lowercase: "quickened spell". */
  name: string;
  /** The option as it stands in the feature text, title included. */
  lines: string[];
  /** What the option does, for an entry on the sheet that is just this option. */
  body: string[];
}

interface FeatureChoice {
  /** The text before the options. */
  intro: string[];
  options: FeatureOption[];
}

/** One class of a (multiclass) character. */
interface ClassPart {
  class: string;
  /** Level in this class; the character level unless the sheet says "Fighter 5 / Wizard 3". */
  level: number;
  /** What the sheet says besides the class name: "circle of the land", or '' when it names no subclass. */
  subclass: string;
}

/** Table columns and starting gear: not something a feature entry on the sheet refers to. */
const SKIPPED_TYPES = new Set(['SPELL_SLOTS', 'STARTING_EQUIPMENT', 'PROFICIENCY_BONUS', 'CLASS_TABLE_DATA']);

const CLASSES = [
  'barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk',
  'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard',
];

const CLASS_OF_SUBCLASS: Record<string, string> = {
  'path of the berserker': 'barbarian',
  'college of lore': 'bard',
  'life domain': 'cleric',
  'circle of the land': 'druid',
  'champion': 'fighter',
  'way of the open hand': 'monk',
  'oath of devotion': 'paladin',
  'hunter': 'ranger',
  'thief': 'rogue',
  'draconic bloodline': 'sorcerer',
  'the fiend': 'warlock',
  'school of evocation': 'wizard',
};

/** Features with these sources are not class features, even when a class feature shares the name. */
const NOT_FROM_A_CLASS = /^(rac|background|feat)/i;

/** "You gain two of the following Metamagic options of your choice." */
const ANNOUNCES_CHOICE = /\b(?:one|two|three) of the following\b/i;
/** "### Quickened Spell" */
const OPTION_HEADING = /^\s*#{2,6}\s*(.+?)\s*$/;
/** "***Colossus Slayer.*** Your tenacity can wear down the most potent foes." */
const OPTION_LEAD = /^\s*\*{2,3}(.+?)\.?\*{2,3}/;
/** An option title the data left unmarked ("Armor of Shadows" in the invocation list). */
const UNMARKED_TITLE = /^[A-Z][A-Za-z' -]{2,40}$/;
/** What separates the parts of a feature name: "Metamagic (Quickened Spell, Twinned Spell)", "Fighting Style: Defense". */
const NAME_SEPARATOR = /\s*[:;,()/]\s*|\s+[-–—&]\s+|\s+and\s+/;

let cache: Map<string, FeatureVariant[]> | null = null;
let pending: Promise<Map<string, FeatureVariant[]>> | null = null;

function toVariant(fields: ClassFeatureJsonFields): FeatureVariant {
  const parent = fields.parent.replace(/^srd_/, '').replace(/-/g, ' ');
  const baseClass = CLASS_OF_SUBCLASS[parent];
  const isOptionList = fields.feature_type === 'CLASS_FEATURE_OPTION_LIST';
  return baseClass
    ? { class: baseClass, subclass: parent, description: fields.desc, isOptionList }
    : { class: parent, description: fields.desc, isOptionList };
}

async function loadDatabase(http: HttpClient): Promise<Map<string, FeatureVariant[]>> {
  if (cache) return cache;
  if (pending) return pending;

  pending = firstValueFrom(http.get<ClassFeatureJsonEntry[]>('/ClassFeature.json')).then(entries => {
    const map = new Map<string, FeatureVariant[]>();
    for (const entry of entries) {
      if (entry.fields.feature_type && SKIPPED_TYPES.has(entry.fields.feature_type)) continue;
      const name = entry.fields.name.toLowerCase();
      map.set(name, [...(map.get(name) ?? []), toVariant(entry.fields)]);
    }
    cache = map;
    pending = null;
    return map;
  });

  return pending;
}

/** The classes of a character, in the order the sheet names them. */
export function classParts(context: Pick<ResolutionContext, 'class' | 'level'>): ClassPart[] {
  return context.class
    .toLowerCase()
    .split('/')
    .flatMap(part => {
      const name = CLASSES.find(candidate => new RegExp(`\\b${candidate}\\b`).test(part));
      if (!name) return [];
      const level = /\d+/.exec(part);
      const subclass = part
        .replace(new RegExp(`\\b${name}\\b`), ' ')
        .replace(/\b(?:level|lvl)\b|[^a-z' ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return [{ class: name, level: level ? Number(level[0]) : context.level, subclass }];
    });
}

/** "circle of the land" -> "land": the word a sheet is sure to use for the subclass. */
function subclassKeyword(subclass: string): string {
  return subclass
    .replace(/^(?:path|college|circle|way|oath|school) of (?:the )?/, '')
    .replace(/^the /, '')
    .replace(/ (?:domain|bloodline)$/, '');
}

function belongsTo(variant: FeatureVariant, part: ClassPart, isOnlyVariant: boolean): boolean {
  if (variant.class !== part.class) return false;
  if (!variant.subclass) return true;
  // A sheet that names no subclass may still list its features; trust the name only when nothing else shares it.
  if (!part.subclass) return isOnlyVariant;
  return new RegExp(`\\b${subclassKeyword(variant.subclass)}\\b`).test(part.subclass);
}

/** The parts of a feature name, lowercase: "Fighting Style: Defense" -> ["fighting style", "defense"]. */
export function nameParts(name: string): string[] {
  return name.toLowerCase().split(NAME_SEPARATOR).map(part => part.trim()).filter(Boolean);
}

/** The options a feature lets a character choose from; null when it has all of what it describes. */
function choiceOf(variant: FeatureVariant): FeatureChoice | null {
  const lines = variant.description.split('\n');
  const usesHeadings = lines.some(line => OPTION_HEADING.test(line));
  const intro: string[] = [];
  const options: FeatureOption[] = [];

  for (const line of lines) {
    const heading = usesHeadings ? OPTION_HEADING.exec(line) : null;
    const unmarked = usesHeadings && variant.isOptionList && UNMARKED_TITLE.test(line.trim());
    const lead = usesHeadings ? null : OPTION_LEAD.exec(line);
    const title = heading?.[1] ?? lead?.[1] ?? (unmarked ? line : null);
    const current = options[options.length - 1];
    if (title) {
      const name = title.replace(/\(table\)/i, '').replace(/[*_.]/g, '').trim().toLowerCase();
      // A lead is part of the sentence it opens; a heading stands apart from the text under it.
      options.push({ name, lines: [line], body: lead ? [line] : [] });
    } else if (current) {
      current.lines.push(line);
      current.body.push(line);
    } else {
      intro.push(line);
    }
  }

  if (options.length < 2) return null;
  return variant.isOptionList || ANNOUNCES_CHOICE.test(intro.join(' ')) ? { intro, options } : null;
}

/** The feature text with, of the options it offers, only the ones named in `chosen`. */
function scopedToChosen(variant: FeatureVariant, chosen: string[][]): string {
  const choice = choiceOf(variant);
  if (!choice) return variant.description;
  // The first list that names an option decides; a list that names none says nothing about the choice.
  for (const names of chosen) {
    const kept = choice.options.filter(option => names.includes(option.name));
    if (kept.length) return [...choice.intro, ...kept.flatMap(option => option.lines)].join('\n');
  }
  return variant.description;
}

function findVariant(
  db: Map<string, FeatureVariant[]>,
  name: string,
  parts: ClassPart[]
): { variant: FeatureVariant; part: ClassPart } | null {
  const variants = db.get(name);
  if (!variants) return null;
  for (const part of parts) {
    const variant = variants.find(candidate => belongsTo(candidate, part, variants.length === 1));
    if (variant) return { variant, part };
  }
  return null;
}

/** An option of one of the character's own features: "Quickened Spell" inside the sorcerer's Metamagic. */
function findOption(
  db: Map<string, FeatureVariant[]>,
  names: string[],
  parts: ClassPart[]
): { text: string; part: ClassPart } | null {
  for (const part of parts) {
    for (const variants of db.values()) {
      for (const variant of variants) {
        if (!belongsTo(variant, part, variants.length === 1)) continue;
        const option = choiceOf(variant)?.options.find(candidate => names.includes(candidate.name));
        if (option) return { text: option.body.join('\n').trim(), part };
      }
    }
  }
  return null;
}

/**
 * The text of a class feature for this character: the variant of its own class
 * (a druid's Spellcasting, not a wizard's), of a feature with a choice only the
 * options it has (two Metamagic options, not all eight), and without what it only
 * gets at a higher level. Null when the bundled data has no text that is certain
 * to be the right one.
 */
export async function lookupFeatureFromJson(
  http: HttpClient,
  feature: FeatureToLookUp,
  context: ResolutionContext
): Promise<FeatureDetails | null> {
  if (feature.source && NOT_FROM_A_CLASS.test(feature.source.trim())) return null;

  const db = await loadDatabase(http);
  const parts = classParts(context);
  const fullName = feature.name.trim().toLowerCase();
  const [baseName, ...named] = nameParts(feature.name);

  // "Metamagic", or "Metamagic (Quickened Spell, Twinned Spell)" by the name before its options.
  const found = findVariant(db, fullName, parts) ?? (named.length ? findVariant(db, baseName, parts) : null);
  if (found) {
    const elsewhere = (context.features ?? []).flatMap(nameParts);
    const text = scopedToChosen(found.variant, [named, elsewhere]);
    return { description: tailorToLevel(text, found.part.level) || text };
  }

  // "Quickened Spell" as an entry of its own.
  const option = findOption(db, [fullName, baseName, ...named], parts);
  return option ? { description: tailorToLevel(option.text, option.part.level) || option.text } : null;
}
