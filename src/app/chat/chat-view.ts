import type { Translations } from '../core/i18n/translations';
import { toDate } from '../shared/utils/date.utils';
import { ChatConversation, ConversationGroup, Message, StoredChatMessage } from './chat.models';

type ChatTexts = Translations['chat'];

/**
 * "maak afbeelding ..." or "generate (an) image ..." asks for a portrait instead of an
 * answer. Both are recognised whatever language the app is in. The English words are
 * ordinary ones, so they only count as the opening of a message: "Don't generate an
 * image yet, first add Shield" is a question, not a request for a picture.
 */
const IMAGE_TRIGGER = /maak\s+afbeelding|^\s*(?:please[,\s]+)?(?:make|create|generate)\s+(?:an?\s+)?image\b/i;

/** After this long without a sign of life the backend is not going to finish any more. */
const REPLY_STALE_AFTER_MS = 10 * 60 * 1000;
const CHARACTER_UPDATE_STALE_AFTER_MS = 30 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isImageRequest(text: string): boolean {
  return IMAGE_TRIGGER.test(text);
}

/** The text for a stored failure of an answer, by its `errorCode`. */
function replyErrorText(errorCode: string | undefined, t: ChatTexts): string {
  return errorCode === 'resource-exhausted' ? t.reply.tooManyRequests : t.reply.failed;
}

function characterUpdateText(status: StoredChatMessage['status'], t: ChatTexts): string {
  switch (status) {
    case 'pending':
    case 'streaming':
      return t.characterUpdate.running;
    case 'done':
      return t.characterUpdate.done;
    case 'error':
      return t.characterUpdate.failed;
    case 'cancelled':
      return t.characterUpdate.cancelled;
    default:
      return '';
  }
}

/** What a finished character update tells about the version it was saved as. */
function savedVersionOf(stored: StoredChatMessage): Partial<Message> {
  return {
    ...(stored.versionNumber ? { versionNumber: stored.versionNumber } : {}),
    ...(stored.versionId ? { versionId: stored.versionId } : {}),
    ...(stored.previousVersionId ? { previousVersionId: stored.previousVersionId } : {}),
    ...(stored.abilityScoreWarnings?.length ? { abilityScoreWarnings: stored.abilityScoreWarnings } : {}),
  };
}

/**
 * A stored message as the chat panel shows it. `now` decides when unfinished work counts
 * as lost; `t` gives the texts for what the app itself says (failures, character updates).
 */
export function toViewMessage(stored: StoredChatMessage, now: number, t: ChatTexts): Message {
  const timestamp = toDate(stored.createdAt) ?? new Date(now);
  const working = stored.status === 'pending' || stored.status === 'streaming';
  const idleFor = now - (toDate(stored.updatedAt) ?? timestamp).getTime();

  if (stored.kind === 'characterUpdate') {
    const lost = working && idleFor > CHARACTER_UPDATE_STALE_AFTER_MS;
    const status = lost ? 'error' : stored.status;
    return {
      id: stored.id,
      sender: status === 'error' ? 'error' : 'system',
      text: characterUpdateText(status, t),
      timestamp,
      ...(working && !lost ? { isUpdatingCharacter: true } : {}),
      ...(status === 'done' ? savedVersionOf(stored) : {}),
    };
  }

  if (stored.sender === 'user') {
    return {
      id: stored.id,
      sender: 'user',
      text: stored.text,
      timestamp,
      ...(stored.pdfFileName ? { pdfFileName: stored.pdfFileName } : {}),
    };
  }

  if (stored.status === 'error') {
    return { id: stored.id, sender: 'error', text: replyErrorText(stored.errorCode, t), timestamp };
  }
  if (working && idleFor > REPLY_STALE_AFTER_MS) {
    return { id: stored.id, sender: 'error', text: t.reply.stale, timestamp };
  }
  return {
    id: stored.id,
    sender: 'ai',
    text: stored.text,
    timestamp,
    ...(stored.images?.length ? { images: stored.images } : {}),
    ...(working ? { inProgress: true } : {}),
  };
}

const startOfDay = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** Whole days between `date` and today: 0 for today, 1 for yesterday. */
function daysAgo(date: Date, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
}

export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a) === startOfDay(b);
}

/** Label of the line that separates the days in a conversation: "Today", "Yesterday", "Tuesday 10 November". */
export function dayLabel(date: Date, now: Date, t: ChatTexts, locale: string): string {
  const days = daysAgo(date, now);
  if (days === 0) return t.today;
  if (days === 1) return t.yesterday;
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  }).format(date);
}

export function formatTime(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
}

/** When a conversation was last used, as short as the list needs it: "20:14", "Mon 9 Nov", "28 Oct 2025". */
export function conversationTime(conversation: ChatConversation, now: Date, locale: string): string {
  const date = toDate(conversation.updatedAt);
  if (!date) return '';
  const days = daysAgo(date, now);
  if (days === 0) return formatTime(date, locale);
  return new Intl.DateTimeFormat(locale, {
    ...(days < 7 ? { weekday: 'short' } : {}),
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  }).format(date);
}

/** Conversations (most recent first) under the headings of the history list; empty headings are left out. */
export function groupConversations(conversations: ChatConversation[], now: Date, t: ChatTexts): ConversationGroup[] {
  const labels = [t.today, t.yesterday, t.history.lastSevenDays, t.history.older];
  const groups: ConversationGroup[] = labels.map(label => ({ label, conversations: [] }));
  for (const conversation of conversations) {
    const date = toDate(conversation.updatedAt);
    const days = date ? daysAgo(date, now) : Number.POSITIVE_INFINITY;
    const index = days <= 0 ? 0 : days === 1 ? 1 : days <= 7 ? 2 : 3;
    groups[index].conversations.push(conversation);
  }
  return groups.filter(group => group.conversations.length > 0);
}

/** Conversations whose title or last message contains the search text. */
export function filterConversations(conversations: ChatConversation[], query: string): ChatConversation[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return conversations;
  return conversations.filter(conversation =>
    conversation.title.toLowerCase().includes(needle)
    || (conversation.lastMessagePreview ?? '').toLowerCase().includes(needle)
  );
}
