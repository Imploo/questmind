export type KankaEntityType = 'characters' | 'locations' | 'quests' | 'organisations';

export interface KankaEntity {
  id: number;
  name: string;
  type: string;
  entry?: string;
  entry_parsed?: string;
  tags?: Array<{ id: number; name: string }>;
  image?: string;
  is_private?: boolean;
}

export interface KankaApiResponse<T> {
  data: T[];
  links?: unknown;
  meta?: unknown;
}

export interface KankaSearchResult {
  characters: KankaEntity[];
  locations: KankaEntity[];
  quests: KankaEntity[];
  organisations: KankaEntity[];
}
