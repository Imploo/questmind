import type { Timestamp } from 'firebase-admin/firestore';
import type { DndCharacter } from '../schemas/dnd-character.schema';

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatAttachment {
  type: 'pdf' | 'image';
  fileName: string;
  mimeType: string;
  data: string; // base64-encoded
}

// ── Stored conversations: characters/{characterId}/chats/{chatId}/messages/{messageId} ──

export type ChatMessageSender = 'user' | 'ai' | 'system';

/** `text`: a question or answer. `image`: a portrait request or result. `characterUpdate`: the draft the answer led to. */
export type ChatMessageKind = 'text' | 'image' | 'characterUpdate';

/**
 * `pending`: waiting for the worker. `streaming`: the worker is writing it.
 * `done` / `error`: finished. `cancelled`: the owner stopped a character update.
 */
export type ChatMessageStatus = 'pending' | 'streaming' | 'done' | 'error' | 'cancelled';

/** Why a message ended in `error`; the frontend turns it into a text for the user. */
export type ChatErrorCode = 'internal' | 'resource-exhausted';

export interface ChatMessageDoc {
  id: string;
  sender: ChatMessageSender;
  kind: ChatMessageKind;
  status: ChatMessageStatus;
  text: string;
  images?: { url: string; mimeType: string }[];
  pdfFileName?: string;
  /** Draft version a character update was saved as. */
  versionId?: string;
  versionNumber?: number;
  errorCode?: ChatErrorCode;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** `auto`: taken from the first question. `ai`: written by the model. `user`: renamed by the owner. */
export type ChatTitleSource = 'auto' | 'ai' | 'user';

export interface ChatDoc {
  id: string;
  title: string;
  titleSource: ChatTitleSource;
  lastMessagePreview: string;
  updatedCharacter?: boolean;
  lastVersionNumber?: number;
  hasImages?: boolean;
  hasPdf?: boolean;
  /** Summary of the messages up to and including `summarizedUntil`; they are no longer sent as history. */
  summary?: string;
  summarizedUntil?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ChatTurnMode = 'text' | 'image';

/** PDF of the current turn, parked in Storage because a task payload is limited to ~1 MB. */
export interface StoredChatAttachment {
  storagePath: string;
  mimeType: string;
  fileName: string;
}

/** What `characterChat` hands to `characterChatWorker`. */
export interface ChatTurnPayload {
  characterId: string;
  chatId: string;
  userMessageId: string;
  replyMessageId: string;
  mode: ChatTurnMode;
  /** The character as the owner sees it right now (latest version + play state), without descriptions. */
  currentCharacter: DndCharacter;
  attachment: StoredChatAttachment | null;
}
