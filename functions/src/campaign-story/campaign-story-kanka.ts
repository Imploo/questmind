import * as logger from '../utils/logger';
import { DocumentData } from 'firebase-admin/firestore';
import { KankaJournal, KankaPost, KankaService, kankaCampaignIdFrom } from '../services/kanka.service';
import { KankaEntitySummary, KankaSearchResult } from '../types/audio-session.types';
import {
  CampaignStoryJournal,
  CampaignStoryReference,
  CampaignStoryReferenceEntry,
} from '../types/campaign-story.types';
import { htmlToText } from '../utils/html-to-text';

/** What Kanka adds to the campaign story: the written reports and who/what exists. */
export interface CampaignStoryKanka {
  journals: CampaignStoryJournal[];
  reference: CampaignStoryReference;
}

/** A report longer than this is cut off; all reports together stay under the total. */
const MAX_JOURNAL_CHARS = 40_000;
const MAX_TOTAL_JOURNAL_CHARS = 300_000;
const MAX_DESCRIPTION_CHARS = 240;
const MAX_REFERENCE_ENTRIES_PER_TYPE = 200;

/** Posts everyone in the campaign can read: 1 = all, 5 = members. The rest is for the DM or the writer. */
const PLAYER_VISIBLE_POSTS = new Set([1, 5]);

/**
 * Reads the Kanka side of the campaign story, or undefined when Kanka is not
 * linked to the campaign. Throws when Kanka is linked but can't be read: the
 * story would silently miss every session that only exists as a written report.
 */
export async function loadCampaignStoryKanka(
  campaignId: string,
  campaign: DocumentData
): Promise<CampaignStoryKanka | undefined> {
  if (campaign.settings?.kankaEnabled !== true) {
    return undefined;
  }
  const kankaCampaignId = kankaCampaignIdFrom(campaign);
  if (!kankaCampaignId) {
    logger.warn(`[Kanka] Kanka is enabled for campaign ${campaignId} but kankaCampaignId is not set in settings`);
    return undefined;
  }
  const token = process.env.KANKA_API_TOKEN;
  if (!token) {
    throw new Error('Kanka integration is enabled but KANKA_API_TOKEN is not configured');
  }

  const service = new KankaService(token);
  const [entities, journals] = await Promise.all([
    service.getAllEntities(kankaCampaignId),
    service.getJournals(kankaCampaignId),
  ]);
  return buildCampaignStoryKanka(entities, journals);
}

/**
 * Turns what Kanka returned into prompt material. Private entities, private
 * journals and posts only the DM can read are left out: every member of the
 * campaign reads the story.
 */
export function buildCampaignStoryKanka(entities: KankaSearchResult, journals: KankaJournal[]): CampaignStoryKanka {
  const visible = {
    characters: publicEntities(entities.characters),
    locations: publicEntities(entities.locations),
    quests: publicEntities(entities.quests),
    organisations: publicEntities(entities.organisations),
  };
  const names = entityNames(Object.values(visible).flat());

  return {
    journals: toStoryJournals(journals, names),
    reference: {
      characters: toReferenceEntries(visible.characters, names),
      locations: toReferenceEntries(visible.locations, names),
      quests: toReferenceEntries(visible.quests, names),
      organisations: toReferenceEntries(visible.organisations, names),
    },
  };
}

function publicEntities(entities: KankaEntitySummary[] | undefined): KankaEntitySummary[] {
  return (entities ?? []).filter(entity => !!entity.name && entity.is_private !== true);
}

/** Entity id → name, to resolve mentions and the author of a journal. */
function entityNames(entities: KankaEntitySummary[]): Map<number, string> {
  const names = new Map<number, string>();
  for (const entity of entities) {
    if (typeof entity.entity_id === 'number') {
      names.set(entity.entity_id, entity.name);
    }
  }
  return names;
}

function toStoryJournals(journals: KankaJournal[], names: Map<number, string>): CampaignStoryJournal[] {
  const result: CampaignStoryJournal[] = [];
  let totalChars = 0;

  for (const journal of journals) {
    if (journal.is_private === true) continue;

    let content = journalText(journal, names);
    if (!content) continue;
    if (content.length > MAX_JOURNAL_CHARS) {
      logger.warn(`[Kanka] Journal ${journal.id} is cut off at ${MAX_JOURNAL_CHARS} of ${content.length} characters`);
      content = `${content.slice(0, MAX_JOURNAL_CHARS)}\n[ingekort]`;
    }
    if (totalChars + content.length > MAX_TOTAL_JOURNAL_CHARS) {
      logger.warn(`[Kanka] Journal ${journal.id} and later ones are left out: over ${MAX_TOTAL_JOURNAL_CHARS} characters in total`);
      break;
    }
    totalChars += content.length;

    result.push({
      journalId: journal.id,
      title: journal.name?.trim() || 'Verslag',
      date: isoDay(journal.date),
      createdAt: isoDay(journal.created_at),
      updatedAt: journal.updated_at ?? null,
      type: journal.type?.trim() || null,
      author: (typeof journal.author_id === 'number' && names.get(journal.author_id)) || null,
      content,
    });
  }
  return result;
}

/** The entry of the journal followed by its posts, in the order Kanka shows them. */
function journalText(journal: KankaJournal, names: Map<number, string>): string {
  const parts = [entryText(journal, names)];

  const posts = (journal.posts ?? [])
    .filter(post => post.visibility_id === undefined || PLAYER_VISIBLE_POSTS.has(post.visibility_id))
    .map((post, index) => ({ post, index }))
    .sort((a, b) => (a.post.position ?? a.index) - (b.post.position ?? b.index) || a.index - b.index);
  for (const { post } of posts) {
    const text = entryText(post, names);
    if (text) {
      parts.push(post.name?.trim() ? `${post.name.trim()}\n${text}` : text);
    }
  }
  return parts.filter(Boolean).join('\n\n');
}

function entryText(item: Pick<KankaPost, 'entry' | 'entry_parsed'>, names: Map<number, string>): string {
  // entry_parsed has the mentions written out already; the raw entry still holds them as codes.
  return htmlToText(resolveMentions(item.entry_parsed || item.entry || '', names));
}

/** Options of a mention that are not its label: `[character:42|page:story]`. */
const MENTION_OPTION = /^(page|tab|anchor|field|alias|params):/i;

/** `[character:42]` → the name of entity 42, `[character:42|Strahd]` → "Strahd". An unknown one is dropped. */
export function resolveMentions(text: string, names: Map<number, string>): string {
  return text.replace(/\[[a-z_]+:(\d+)((?:\|[^\]|]*)*)\]/gi, (_match, id: string, options: string) => {
    const label = options.split('|').map(option => option.trim()).find(option => option && !MENTION_OPTION.test(option));
    return label ?? names.get(Number(id)) ?? '';
  });
}

function toReferenceEntries(entities: KankaEntitySummary[], names: Map<number, string>): CampaignStoryReferenceEntry[] {
  return entities.slice(0, MAX_REFERENCE_ENTRIES_PER_TYPE).map(entity => {
    const entry: CampaignStoryReferenceEntry = { name: entity.name.trim() };
    const type = entity.type?.trim();
    if (type) entry.type = type;
    const description = shorten(entryText(entity, names).replace(/\s+/g, ' '), MAX_DESCRIPTION_CHARS);
    if (description) entry.description = description;
    return entry;
  });
}

/** Cut at a word boundary. */
function shorten(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** `2017-11-02` out of a Kanka date or timestamp, or null when it isn't one. */
function isoDay(value: string | null | undefined): string | null {
  const day = typeof value === 'string' ? value.slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(day)) ? day : null;
}
