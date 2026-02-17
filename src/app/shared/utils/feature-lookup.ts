import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface FeatureDetails {
  description: string;
}

interface ClassFeatureJsonFields {
  name: string;
  desc: string;
  parent: string;
  document: string;
  feature_type?: string;
}

interface ClassFeatureJsonEntry {
  fields: ClassFeatureJsonFields;
}

const SKIPPED_TYPES = new Set(['SPELL_SLOTS', 'STARTING_EQUIPMENT']);

let cache: Map<string, FeatureDetails> | null = null;
let pending: Promise<Map<string, FeatureDetails>> | null = null;

async function loadDatabase(http: HttpClient): Promise<Map<string, FeatureDetails>> {
  if (cache) return cache;
  if (pending) return pending;

  pending = firstValueFrom(http.get<ClassFeatureJsonEntry[]>('/ClassFeature.json')).then(entries => {
    const map = new Map<string, FeatureDetails>();
    for (const entry of entries) {
      if (entry.fields.feature_type && SKIPPED_TYPES.has(entry.fields.feature_type)) continue;
      map.set(entry.fields.name.toLowerCase(), {
        description: entry.fields.desc,
      });
    }
    cache = map;
    pending = null;
    return map;
  });

  return pending;
}

export async function lookupFeatureFromJson(http: HttpClient, name: string): Promise<FeatureDetails | null> {
  const db = await loadDatabase(http);
  return db.get(name.toLowerCase()) ?? null;
}
