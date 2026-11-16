import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { tailorToLevel } from './level-tailoring';
import { ResolutionContext } from './resolution-context';

export interface SpellDetails {
  description: string;
  usage: string;
  /** 0 = cantrip. Only set when the spell comes from Spell.json. */
  level?: number;
  school?: string;
  /** Only set when the spell comes from Spell.json. */
  concentration?: boolean;
}

interface SpellJsonFields {
  name: string;
  desc: string;
  higher_level?: string;
  casting_time: string;
  range_text: string;
  duration: string;
  verbal: boolean;
  somatic: boolean;
  material: boolean;
  material_specified?: string | null;
  level?: number;
  school?: string;
  concentration?: boolean;
  ritual?: boolean;
}

interface SpellJsonEntry {
  fields: SpellJsonFields;
}

let cache: Map<string, SpellJsonFields> | null = null;
let pending: Promise<Map<string, SpellJsonFields>> | null = null;

function buildComponents(f: SpellJsonFields): string {
  const parts: string[] = [];
  if (f.verbal) parts.push('V');
  if (f.somatic) parts.push('S');
  if (f.material) {
    parts.push(f.material_specified ? `M (${f.material_specified})` : 'M');
  }
  return parts.join(', ') || 'None';
}

/** What the spell does beyond its base text, as far as this character can make use of it. */
function higherLevelText(f: SpellJsonFields, context?: ResolutionContext): string {
  if (!f.higher_level) return '';
  if (!context) return f.higher_level;
  // A cantrip grows with the character's level.
  if (f.level === 0) return tailorToLevel(f.higher_level, context.level);
  // Other spells grow with the slot they are cast with, which takes a slot above the spell's own level.
  const canUpcast = context.maxSpellSlotLevel === undefined || f.level === undefined || context.maxSpellSlotLevel > f.level;
  return canUpcast ? f.higher_level : '';
}

function buildDescription(f: SpellJsonFields, context?: ResolutionContext): string {
  // Only a cantrip's own text talks about character levels; in other spells "5th level" is a spell or slot level.
  const desc = context && f.level === 0 ? tailorToLevel(f.desc, context.level) || f.desc : f.desc;
  const higher = higherLevelText(f, context);
  return higher ? `${desc}\n\nAt Higher Levels. ${higher}` : desc;
}

function buildUsage(f: SpellJsonFields): string {
  const lines = [
    `Casting Time: ${f.casting_time}`,
    `Range: ${f.range_text}`,
    `Components: ${buildComponents(f)}`,
    `Duration: ${f.duration}`,
  ];
  if (f.concentration) lines.push('Concentration: Yes');
  if (f.ritual) lines.push('Ritual: Yes');
  return lines.join('\n');
}

async function loadDatabase(http: HttpClient): Promise<Map<string, SpellJsonFields>> {
  if (cache) return cache;
  if (pending) return pending;

  pending = firstValueFrom(http.get<SpellJsonEntry[]>('/Spell.json')).then(entries => {
    const map = new Map<string, SpellJsonFields>();
    for (const entry of entries) {
      map.set(entry.fields.name.toLowerCase(), entry.fields);
    }
    cache = map;
    pending = null;
    return map;
  });

  return pending;
}

/**
 * The spell as the bundled data has it. With a `context`, the description leaves out
 * what the character cannot use yet: how a cantrip grows while it has not reached the
 * first tier, and "At Higher Levels" when it has no slot above the spell's level.
 */
export async function lookupSpellFromJson(
  http: HttpClient,
  name: string,
  context?: ResolutionContext
): Promise<SpellDetails | null> {
  const fields = (await loadDatabase(http)).get(name.toLowerCase());
  if (!fields) return null;
  return {
    description: buildDescription(fields, context),
    usage: buildUsage(fields),
    level: fields.level,
    school: fields.school,
    concentration: fields.concentration === true,
  };
}
