import { Timestamp } from 'firebase/firestore';

// ── Stored: characters/{characterId}/chats/{chatId}/messages/{messageId} (written by the backend) ──

export type ChatMessageSender = 'user' | 'ai' | 'system';
export type ChatMessageKind = 'text' | 'image' | 'characterUpdate';
/** `pending`/`streaming`: the backend is still working on it. `cancelled`: a character update the owner stopped. */
export type ChatMessageStatus = 'pending' | 'streaming' | 'done' | 'error' | 'cancelled';
export type ChatTurnMode = 'text' | 'image';

export interface MessageImage {
  url: string;
  mimeType: string;
}

export interface StoredChatMessage {
  id: string;
  sender: ChatMessageSender;
  kind: ChatMessageKind;
  status: ChatMessageStatus;
  text: string;
  images?: MessageImage[];
  pdfFileName?: string;
  /** Draft version a character update was saved as. */
  versionNumber?: number;
  errorCode?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** One conversation in the history of a character. */
export interface ChatConversation {
  id: string;
  title: string;
  /** `auto`: the first question. `ai`: written by the model. `user`: renamed by the owner. */
  titleSource: 'auto' | 'ai' | 'user';
  lastMessagePreview: string;
  updatedCharacter?: boolean;
  lastVersionNumber?: number;
  hasImages?: boolean;
  hasPdf?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ── Shown in the chat panel ──

export interface Message {
  id: string;
  sender: 'user' | 'ai' | 'error' | 'system';
  text: string;
  images?: MessageImage[];
  pdfFileName?: string;
  timestamp: Date;
  /** An answer the backend is still writing. */
  inProgress?: boolean;
  /** A character update that is still running and can be cancelled. */
  isUpdatingCharacter?: boolean;
  /** The version a finished character update was saved as. */
  versionNumber?: number;
}

export interface ConversationGroup {
  label: string;
  conversations: ChatConversation[];
}
