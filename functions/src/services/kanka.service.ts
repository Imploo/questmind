/**
 * Backend Kanka Service
 *
 * Fetches campaign entities from Kanka API for use in transcription prompts.
 * Ported from frontend kanka.service.ts for use in Cloud Functions.
 */

import * as logger from '../utils/logger';
import { getFirestore } from 'firebase-admin/firestore';
import { KankaSearchResult } from '../types/audio-session.types';

export type KankaEntityType = 'characters' | 'locations' | 'quests' | 'organisations';

export interface KankaEntity {
  id: number;
  name: string;
  type?: string;
  entry?: string;
  entry_parsed?: string;
}

export interface KankaApiResponse<T> {
  data: T[];
  links?: unknown;
  meta?: unknown;
}

const DEFAULT_TYPES: KankaEntityType[] = ['characters', 'locations', 'quests', 'organisations'];
const KANKA_API_BASE = 'https://api.kanka.io/1.0';

/**
 * Fetch Kanka context for transcription
 *
 * This is a convenience method that handles:
 * 1. Reading campaign settings from Firestore
 * 2. Fetching Kanka entities if enabled
 *
 * @param campaignId - The campaign ID
 * @param sessionId - The audio session ID (used for logging)
 * @param enableKankaContext - Whether Kanka is enabled for this transcription
 * @param sessionDate - Optional session date (ISO string) for journal date filtering
 * @returns KankaSearchResult if fetched, undefined if not enabled
 * @throws Error if Kanka is enabled but cannot fetch data
 */
export async function fetchKankaContextForTranscription(
  campaignId: string,
  sessionId: string,
  enableKankaContext: boolean
): Promise<KankaSearchResult | undefined> {
  if (!enableKankaContext) {
    return undefined;
  }

  const db = getFirestore();
  const campaignRef = db.collection('campaigns').doc(campaignId);

  // Get campaign settings
  const campaignSnap = await campaignRef.get();
  const campaignData = campaignSnap.data();
  const kankaCampaignId = campaignData?.settings?.kankaCampaignId;

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

  // Fetch entities
  logger.debug(`[Kanka] Fetching entities for campaign ${kankaCampaignId} (session ${sessionId})...`);
  const kankaService = new KankaService(kankaToken);
  const kankaContext = await kankaService.getAllEntities(kankaCampaignId);

  logger.debug('[Kanka] Entities fetched successfully');
  return kankaContext;
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

    const result: KankaSearchResult = {
      characters: [],
      locations: [],
      quests: [],
      organisations: [],
    };

    // Fetch all entity types in parallel
    const fetchPromises = types.map(async (entityType) => {
      try {
        const entities = await this.fetchEntitiesByType(kankaCampaignId, entityType);
        result[entityType] = entities as never[];
      } catch (error) {
        console.error(`[Kanka] Failed to fetch ${entityType}:`, error);
        // Continue with empty array for this type
        result[entityType] = [];
      }
    });

    await Promise.all(fetchPromises);

    return result;
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
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Kanka API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const json = (await response.json()) as KankaApiResponse<KankaEntity>;
      return json.data || [];
    } catch (error) {
      console.error(`[Kanka] Error fetching ${entityType}:`, error);
      throw error;
    }
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

    const result: KankaSearchResult = {
      characters: [],
      locations: [],
      quests: [],
      organisations: [],
    };

    const fetchPromises = types.map(async (entityType) => {
      try {
        const entities = await this.searchByType(kankaCampaignId, entityType, query);
        result[entityType] = entities as never[];
      } catch (error) {
        console.error(`[Kanka] Failed to search ${entityType}:`, error);
        result[entityType] = [];
      }
    });

    await Promise.all(fetchPromises);

    return result;
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
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Kanka API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const json = (await response.json()) as KankaApiResponse<KankaEntity>;
      return json.data || [];
    } catch (error) {
      console.error(`[Kanka] Error searching ${entityType}:`, error);
      throw error;
    }
  }
}


