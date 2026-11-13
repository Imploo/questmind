import { HttpsError } from 'firebase-functions/v2/https';
import type {
  ChatErrorCode,
  ChatHistoryMessage,
  ChatMessageDoc,
  ChatTurnMode,
} from '../types/chat.types';
import type { DndCharacter } from '../schemas/dnd-character.schema';

/** Longest message a user can send. */
export const MAX_MESSAGE_CHARS = 8000;

/** Messages that stay in the history after older ones are folded into the summary. */
export const HISTORY_WINDOW = 20;

/** Extra messages allowed on top of the window before the summary is updated again. */
export const SUMMARY_SLACK = 10;

const TITLE_MAX_CHARS = 48;
const PREVIEW_MAX_CHARS = 120;
const IMAGE_TRIGGER = /maak\s+afbeelding\s*(.*)/is;

/** Ids the client makes up for a chat or message (a UUID): safe as a document id and a file name. */
export function isClientId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

/** One line of at most `max` characters, cut at a word boundary. */
export function truncate(text: string, max: number): string {
  const line = text.replace(/\s+/g, ' ').trim();
  if (line.length <= max) return line;
  const cut = line.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** What comes after "maak afbeelding": the scene the user asks for. */
export function imagePromptFrom(text: string): string {
  return IMAGE_TRIGGER.exec(text)?.[1]?.trim() || text;
}

/** Title of a new chat, until the model writes a better one with its first answer. */
export function makeAutoTitle(text: string, mode: ChatTurnMode, pdfFileName?: string): string {
  if (pdfFileName) return truncate(`Import: ${pdfFileName}`, TITLE_MAX_CHARS);
  if (mode === 'image') return truncate(`Afbeelding: ${imagePromptFrom(text)}`, TITLE_MAX_CHARS);
  return truncate(text, TITLE_MAX_CHARS);
}

/** A title written by the model, cleaned up; null when it is unusable. */
export function sanitizeTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const title = raw.replace(/\s+/g, ' ').trim().replace(/^["'“”‘’]+|["'“”‘’.]+$/g, '').trim();
  return title ? truncate(title, TITLE_MAX_CHARS) : null;
}

/** Line under the title in the list of chats: plain text, no markdown. */
export function makePreview(text: string): string {
  return truncate(text.replace(/[*_`#>]/g, ''), PREVIEW_MAX_CHARS);
}

type HistorySource = Pick<ChatMessageDoc, 'sender' | 'kind' | 'status' | 'text'>;

/**
 * The finished questions and answers of a conversation as model history, oldest first.
 * Image requests, character updates and failed answers are left out; turns that end up
 * next to each other with the same role are joined, and the history starts with the user.
 */
export function toHistory(messages: HistorySource[], max = HISTORY_WINDOW + SUMMARY_SLACK): ChatHistoryMessage[] {
  const history: ChatHistoryMessage[] = [];
  for (const message of messages) {
    if (message.kind !== 'text' || message.status !== 'done' || message.sender === 'system') continue;
    const content = message.text.trim();
    if (!content) continue;
    const role = message.sender === 'user' ? 'user' : 'assistant';
    const previous = history[history.length - 1];
    if (previous?.role === role) {
      previous.content = `${previous.content}\n\n${content}`;
    } else {
      history.push({ role, content });
    }
  }
  const recent = history.slice(-max);
  return recent[0]?.role === 'assistant' ? recent.slice(1) : recent;
}

/** What the model always gets first: the character as it is now, and what was said before the history starts. */
export function contextPreamble(character: DndCharacter, summary?: string): ChatHistoryMessage[] {
  const preamble: ChatHistoryMessage[] = [
    { role: 'user', content: `Huidig karakter:\n${JSON.stringify(character)}` },
    { role: 'assistant', content: 'Karakter ontvangen, zal het inlezen.' },
  ];
  if (summary?.trim()) {
    preamble.push(
      { role: 'user', content: `Samenvatting van het eerdere deel van dit gesprek:\n${summary.trim()}` },
      { role: 'assistant', content: 'Duidelijk, ik neem dit mee.' },
    );
  }
  return preamble;
}

/** Error code stored on a failed message. */
export function chatErrorCode(error: unknown): ChatErrorCode {
  if (error instanceof HttpsError && error.code === 'resource-exhausted') return 'resource-exhausted';
  if (error instanceof Error && error.message.includes('429')) return 'resource-exhausted';
  return 'internal';
}
