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

let cache: Map<string, FeatureVariant[]> | null = null;
let pending: Promise<Map<string, FeatureVariant[]>> | null = null;

function toVariant(fields: ClassFeatureJsonFields): FeatureVariant {
  const parent = fields.parent.replace(/^srd_/, '').replace(/-/g, ' ');
  const baseClass = CLASS_OF_SUBCLASS[parent];
  return baseClass
    ? { class: baseClass, subclass: parent, description: fields.desc }
    : { class: parent, description: fields.desc };
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

/**
 * The text of a class feature for this character: the variant of its own class
 * (a druid's Spellcasting, not a wizard's), without what it only gets at a higher
 * level. Null when the bundled data has no text that is certain to be the right one.
 */
export async function lookupFeatureFromJson(
  http: HttpClient,
  feature: FeatureToLookUp,
  context: ResolutionContext
): Promise<FeatureDetails | null> {
  if (feature.source && NOT_FROM_A_CLASS.test(feature.source.trim())) return null;

  const variants = (await loadDatabase(http)).get(feature.name.toLowerCase());
  if (!variants) return null;

  for (const part of classParts(context)) {
    const variant = variants.find(candidate => belongsTo(candidate, part, variants.length === 1));
    if (variant) {
      return { description: tailorToLevel(variant.description, part.level) || variant.description };
    }
  }
  return null;
}
