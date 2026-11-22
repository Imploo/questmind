/**
 * Backend Kanka Service
 *
 * Fetches campaign entities from Kanka API for use in transcription prompts.
 * Ported from frontend kanka.service.ts for use in Cloud Functions.
 */

import * as logger from '../utils/logger';
import { DocumentData, getFirestore } from 'firebase-admin/firestore';
import { KankaEntitySummary, KankaSearchResult } from '../types/audio-session.types';

export type KankaEntityType = 'characters' | 'locations' | 'quests' | 'organisations';

export interface KankaEntity extends KankaEntitySummary {
  id: number;
}

/** A post on an entity: Kanka's way to split a long text into parts. */
export interface KankaPost {
  name?: string;
  entry?: string;
  entry_parsed?: string;
  /** 1 all, 2 self, 3 admin, 4 self-admin, 5 members */
  visibility_id?: number;
  position?: number | null;
}

/** A journal: where players and the DM write their session reports. */
export interface KankaJournal extends KankaEntity {
  /** Real-world date, YYYY-MM-DD */
  date?: string | null;
  /** Entity id of the character that wrote it */
  author_id?: number | null;
  created_at?: string;
  updated_at?: string;
  /** Only with `related=1` */
  posts?: KankaPost[];
}

export interface KankaApiResponse<T> {
  data: T[];
  links?: { next?: string | null } | null;
  meta?: unknown;
}

const DEFAULT_TYPES: KankaEntityType[] = ['characters', 'locations', 'quests', 'organisations'];
const KANKA_API_BASE = 'https://api.kanka.io/1.0';
/** A list is paged; this many pages is far more than a campaign holds and keeps us under the rate limit. */
const MAX_PAGES = 10;
const REQUEST_TIMEOUT_MS = 30_000;

/** Kanka campaign id from a campaign document (`settings.kankaCampaignId`), if set. */
export function kankaCampaignIdFrom(campaign: DocumentData | undefined): string | undefined {
  const id = campaign?.settings?.kankaCampaignId;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/**
 * Fetch the Kanka entities of a campaign whose Kanka integration is enabled.
 *
 * @param campaignId - The campaign ID (for logging)
 * @param kankaCampaignId - The linked Kanka campaign, from the campaign settings
 * @returns KankaSearchResult, or undefined when no Kanka campaign is linked
 * @throws Error if Kanka is linked but the API token is missing or the fetch fails
 */
export async function fetchKankaContext(
  campaignId: string,
  kankaCampaignId: string | undefined
): Promise<KankaSearchResult | undefined> {
  if (!kankaCampaignId) {
    logger.warn(
      `[Kanka] Kanka is enabled for campaign ${campaignId} but kankaCampaignId is not set in settings`
    );
    return undefined;
  }

  // Get API token from environment
  const kankaToken = process.env.KANKA_API_TOKEN;
  if (!kankaToken) {
    throw new Error('Kanka integration is enabled but KANKA_API_TOKEN is not configured');
  }

  logger.debug(`[Kanka] Fetching entities for Kanka campaign ${kankaCampaignId} (campaign ${campaignId})...`);
  const kankaContext = await new KankaService(kankaToken).getAllEntities(kankaCampaignId);

  logger.debug('[Kanka] Entities fetched successfully');
  return kankaContext;
}

/**
 * Fetch Kanka context for a session: reads the campaign settings, then fetches
 * the entities when Kanka is enabled. For callers that don't have the campaign
 * document yet (the transcription task gets the Kanka campaign id in its payload).
 *
 * @param campaignId - The campaign ID
 * @param sessionId - The audio session ID (used for logging)
 * @param enableKankaContext - Whether Kanka is enabled for this session
 * @returns KankaSearchResult if fetched, undefined if not enabled
 */
export async function fetchKankaContextForSession(
  campaignId: string,
  sessionId: string,
  enableKankaContext: boolean
): Promise<KankaSearchResult | undefined> {
  if (!enableKankaContext) {
    return undefined;
  }
  logger.debug(`[Kanka] Loading Kanka settings for session ${sessionId}`);
  const campaignSnap = await getFirestore().doc(`campaigns/${campaignId}`).get();
  return fetchKankaContext(campaignId, kankaCampaignIdFrom(campaignSnap.data()));
}

/**
 * Campaign reference block appended to the transcription and story prompts, so
 * names and places are spelled correctly. Empty when there is nothing to list.
 */
export function buildKankaContextBlock(context: KankaSearchResult | undefined): string {
  if (!context) {
    return '';
  }

  const sections: string[] = [];
  const addSection = (label: string, entities: { name: string }[] | undefined) => {
    const names = (entities ?? [])
      .map(entity => entity.name)
      .filter(Boolean)
      .join(', ');
    if (names) {
      sections.push(`${label}: ${names}`);
    }
  };

  addSection('Characters', context.characters);
  addSection('Locations', context.locations);
  addSection('Quests', context.quests);
  addSection('Organisations', context.organisations);

  if (sections.length === 0) {
    return '';
  }

  return `CAMPAIGN REFERENCE (for name/place accuracy only):
${sections.join('\n')}

Remember: Use this context ONLY to spell names and places correctly when you hear them. Do not add information that wasn't spoken, and never use this list to decide who is speaking.`;
}

export class KankaService {
  private apiToken: string;

  constructor(apiToken: string) {
    if (!apiToken) {
      throw new Error('Kanka API token is required');
    }
    this.apiToken = apiToken;
  }

  /**
   * Fetch all entities from the specified Kanka campaign
   */
  async getAllEntities(
    kankaCampaignId: string,
    types: KankaEntityType[] = DEFAULT_TYPES
  ): Promise<KankaSearchResult> {
    if (!kankaCampaignId) {
      throw new Error('Kanka campaign ID is required');
    }

    return this.fetchEntityTypes(types, (entityType) =>
      this.fetchEntitiesByType(kankaCampaignId, entityType)
    );
  }

  /**
   * Shared parallel fetch across entity types with graceful per-type error handling
   */
  private async fetchEntityTypes(
    types: KankaEntityType[],
    fetchFn: (entityType: KankaEntityType) => Promise<KankaEntity[]>
  ): Promise<KankaSearchResult> {
    const result = {
      characters: [],
      locations: [],
      quests: [],
      organisations: [],
    } as Record<KankaEntityType, KankaEntity[]>;

    const fetchPromises = types.map(async (entityType) => {
      try {
        result[entityType] = await fetchFn(entityType);
      } catch (error) {
        logger.error(`[Kanka] Failed to fetch ${entityType}:`, error);
        result[entityType] = [];
      }
    });

    await Promise.all(fetchPromises);
    return result as unknown as KankaSearchResult;
  }

  /**
   * Fetch entities of a specific type from Kanka API
   */
  private async fetchEntitiesByType(
    kankaCampaignId: string,
    entityType: KankaEntityType
  ): Promise<KankaEntity[]> {
    const url = `${KANKA_API_BASE}/campaigns/${kankaCampaignId}/${entityType}`;

    try {
      return await this.fetchList<KankaEntity>(url);
    } catch (error) {
      logger.error(`[Kanka] Error fetching ${entityType}:`, error);
      throw error;
    }
  }

  /**
   * Fetch all journals of the campaign, each with its posts. Unlike
   * `getAllEntities` this throws when Kanka can't be read: a caller that builds
   * a story from the journals must not silently continue without them.
   */
  async getJournals(kankaCampaignId: string): Promise<KankaJournal[]> {
    if (!kankaCampaignId) {
      throw new Error('Kanka campaign ID is required');
    }
    return this.fetchList<KankaJournal>(`${KANKA_API_BASE}/campaigns/${kankaCampaignId}/journals?related=1`);
  }

  /** One list, page by page for as long as Kanka says there is a next one. */
  private async fetchList<T>(url: string): Promise<T[]> {
    const items: T[] = [];
    let hasNext = true;

    for (let page = 1; hasNext && page <= MAX_PAGES; page++) {
      // The page number goes on our own address, so the filters stay and the token only goes to Kanka.
      const pageUrl = page === 1 ? url : `${url}${url.includes('?') ? '&' : '?'}page=${page}`;
      const response = await fetch(pageUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Kanka API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const json = (await response.json()) as KankaApiResponse<T>;
      items.push(...(json.data || []));
      hasNext = !!json.links?.next;
    }

    if (hasNext) {
      logger.warn(`[Kanka] ${url} has more than ${MAX_PAGES} pages; the rest is left out`);
    }
    return items;
  }

  /**
   * Search for entities by name
   */
  async searchEntities(
    kankaCampaignId: string,
    query: string,
    types: KankaEntityType[] = DEFAULT_TYPES
  ): Promise<KankaSearchResult> {
    if (!kankaCampaignId || !query.trim()) {
      throw new Error('Kanka campaign ID and query are required');
    }

    return this.fetchEntityTypes(types, (entityType) =>
      this.searchByType(kankaCampaignId, entityType, query)
    );
  }

  /**
   * Search for entities of a specific type by name
   */
  private async searchByType(
    kankaCampaignId: string,
    entityType: KankaEntityType,
    query: string
  ): Promise<KankaEntity[]> {
    const url = `${KANKA_API_BASE}/campaigns/${kankaCampaignId}/${entityType}?name=${encodeURIComponent(
      query
    )}`;

    try {
      return await this.fetchList<KankaEntity>(url);
    } catch (error) {
      logger.error(`[Kanka] Error searching ${entityType}:`, error);
      throw error;
    }
  }
}
