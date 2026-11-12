import { toDate } from '../shared/utils/date.utils';
import { ChatConversation, ConversationGroup, Message, StoredChatMessage } from './chat.models';

/** "maak afbeelding ..." asks for a portrait instead of an answer. */
const IMAGE_TRIGGER = /maak\s+afbeelding/i;

/** After this long without a sign of life the backend is not going to finish any more. */
const REPLY_STALE_AFTER_MS = 10 * 60 * 1000;
const CHARACTER_UPDATE_STALE_AFTER_MS = 30 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const LOCALE = 'nl-NL';

export function isImageRequest(text: string): boolean {
  return IMAGE_TRIGGER.test(text);
}

const REPLY_ERRORS: Record<string, string> = {
  'resource-exhausted': 'Te veel verzoeken op dit moment. Wacht even en probeer het opnieuw.',
};
const REPLY_ERROR_FALLBACK = 'Het antwoord is niet gelukt. Probeer het opnieuw.';
const REPLY_STALE = 'Er kwam geen antwoord. Probeer het opnieuw.';

const CHARACTER_UPDATE_TEXT: Record<string, string> = {
  pending: 'Karakter wordt aangepast...',
  streaming: 'Karakter wordt aangepast...',
  done: 'Karakter is aangepast!',
  error: 'Karakter aanpassen mislukt.',
  cancelled: 'Karakter aanpassen geannuleerd.',
};

/** A stored message as the chat panel shows it. `now` decides when unfinished work counts as lost. */
export function toViewMessage(stored: StoredChatMessage, now: number): Message {
  const timestamp = toDate(stored.createdAt) ?? new Date(now);
  const working = stored.status === 'pending' || stored.status === 'streaming';
  const idleFor = now - (toDate(stored.updatedAt) ?? timestamp).getTime();

  if (stored.kind === 'characterUpdate') {
    const lost = working && idleFor > CHARACTER_UPDATE_STALE_AFTER_MS;
    const status = lost ? 'error' : stored.status;
    return {
      id: stored.id,
      sender: status === 'error' ? 'error' : 'system',
      text: CHARACTER_UPDATE_TEXT[status] ?? '',
      timestamp,
      ...(working && !lost ? { isUpdatingCharacter: true } : {}),
      ...(status === 'done' && stored.versionNumber ? { versionNumber: stored.versionNumber } : {}),
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
    return { id: stored.id, sender: 'error', text: REPLY_ERRORS[stored.errorCode ?? ''] ?? REPLY_ERROR_FALLBACK, timestamp };
  }
  if (working && idleFor > REPLY_STALE_AFTER_MS) {
    return { id: stored.id, sender: 'error', text: REPLY_STALE, timestamp };
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

/** Label of the line that separates the days in a conversation: "Vandaag", "Gisteren", "dinsdag 10 november". */
export function dayLabel(date: Date, now: Date): string {
  const days = daysAgo(date, now);
  if (days === 0) return 'Vandaag';
  if (days === 1) return 'Gisteren';
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  }).format(date);
}

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' }).format(date);
}

/** When a conversation was last used, as short as the list needs it: "20:14", "ma 9 nov", "28 okt 2025". */
export function conversationTime(conversation: ChatConversation, now: Date): string {
  const date = toDate(conversation.updatedAt);
  if (!date) return '';
  const days = daysAgo(date, now);
  if (days === 0) return formatTime(date);
  return new Intl.DateTimeFormat(LOCALE, {
    ...(days < 7 ? { weekday: 'short' } : {}),
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  }).format(date);
}

const GROUP_LABELS = ['Vandaag', 'Gisteren', 'Afgelopen 7 dagen', 'Ouder'] as const;

/** Conversations (most recent first) under the headings of the history list; empty headings are left out. */
export function groupConversations(conversations: ChatConversation[], now: Date): ConversationGroup[] {
  const groups: ConversationGroup[] = GROUP_LABELS.map(label => ({ label, conversations: [] }));
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
