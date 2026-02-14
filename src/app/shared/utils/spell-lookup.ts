import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface SpellDetails {
  description: string;
  usage: string;
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
  concentration?: boolean;
  ritual?: boolean;
}

interface SpellJsonEntry {
  fields: SpellJsonFields;
}

let cache: Map<string, SpellDetails> | null = null;
let pending: Promise<Map<string, SpellDetails>> | null = null;

function buildComponents(f: SpellJsonFields): string {
  const parts: string[] = [];
  if (f.verbal) parts.push('V');
  if (f.somatic) parts.push('S');
  if (f.material) {
    parts.push(f.material_specified ? `M (${f.material_specified})` : 'M');
  }
  return parts.join(', ') || 'None';
}

function buildDescription(f: SpellJsonFields): string {
  return f.higher_level ? `${f.desc}\n\nAt Higher Levels. ${f.higher_level}` : f.desc;
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

async function loadDatabase(http: HttpClient): Promise<Map<string, SpellDetails>> {
  if (cache) return cache;
  if (pending) return pending;

  pending = firstValueFrom(http.get<SpellJsonEntry[]>('/Spell.json')).then(entries => {
    const map = new Map<string, SpellDetails>();
    for (const entry of entries) {
      map.set(entry.fields.name.toLowerCase(), {
        description: buildDescription(entry.fields),
        usage: buildUsage(entry.fields),
      });
    }
    cache = map;
    pending = null;
    return map;
  });

  return pending;
}

export async function lookupSpellFromJson(http: HttpClient, name: string): Promise<SpellDetails | null> {
  const db = await loadDatabase(http);
  return db.get(name.toLowerCase()) ?? null;
}
