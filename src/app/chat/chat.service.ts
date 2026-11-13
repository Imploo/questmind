import { computed, effect, inject, Injectable, Signal, signal, untracked } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { DndCharacter } from '../shared/models/dnd-character.model';
import { stripCharacterDetails, type ChatAttachment } from '../shared/utils/build-character-context';
import { ChatRepositoryFactory } from '../shared/repository/chat.repository';
import { FirebaseService } from '../core/firebase.service';
import * as logger from '../shared/logger';
import { ToastService } from '../shared/services/toast.service';
import { callableErrorCode, isPermissionDenied, PERMISSION_DENIED_MESSAGE } from '../shared/utils/callable-error';
import { ChatConversation, ChatTurnMode, Message, StoredChatMessage } from './chat.models';
import { isImageRequest, toViewMessage } from './chat-view';

export type { ChatAttachment };
export type { Message, MessageImage } from './chat.models';

/** Conversations loaded at a time in the history list. */
const CONVERSATION_PAGE = 30;
/** Messages loaded at a time in a conversation. */
const MESSAGE_PAGE = 100;
/** A PDF of up to 10 MB travels with the call, so it gets more time than the default 70 seconds. */
const SEND_TIMEOUT_MS = 180_000;
/** How often unfinished answers are checked for having been lost. */
const STALE_CHECK_INTERVAL_MS = 60_000;
const MAX_TITLE_CHARS = 80;

interface CharacterChatRequest {
  characterId: string;
  chatId: string;
  userMessageId: string;
  replyMessageId: string;
  text: string;
  mode: ChatTurnMode;
  currentCharacter: DndCharacter;
  attachment?: ChatAttachment;
}

interface LiveSource<T> {
  readonly get: Signal<T[]>;
  readonly error: Signal<Error | null>;
  waitForData(): Promise<void>;
  destroy(): void;
}

/**
 * The rows of a repository that can be swapped for another one. With `keepCurrent`
 * the rows on screen stay until the replacement has its first data, so loading a
 * larger page does not flash an empty list.
 */
class LiveList<T> {
  private readonly source = signal<LiveSource<T> | null>(null);
  private waiting: LiveSource<T> | null = null;

  readonly items = computed<T[]>(() => this.source()?.get() ?? []);
  /** Set when the shown source cannot be read, e.g. because access was refused. */
  readonly error = computed<Error | null>(() => this.source()?.error() ?? null);
  /** True once the shown source has delivered its first data. */
  readonly loaded = signal(false);

  show(next: LiveSource<T> | null, keepCurrent = false): void {
    this.waiting?.destroy();
    this.waiting = null;

    if (!next) {
      this.replace(null);
      this.loaded.set(false);
      return;
    }

    // Starts listening, so reading the rows later never has to.
    const ready = next.waitForData();
    if (keepCurrent && this.source()) {
      this.waiting = next;
      void ready.then(() => {
        if (this.waiting !== next) return;
        this.waiting = null;
        this.replace(next);
        this.loaded.set(true);
      });
      return;
    }

    this.replace(next);
    this.loaded.set(false);
    void ready.then(() => {
      if (this.source() === next) this.loaded.set(true);
    });
  }

  private replace(next: LiveSource<T> | null): void {
    const previous = this.source();
    this.source.set(next);
    if (previous && previous !== next) previous.destroy();
  }
}

/** A message shown before the backend has stored it, or the failure of sending it. */
interface LocalMessage {
  chatId: string;
  message: Message;
}

/**
 * Conversations with The Sidekick, per character. They are stored in Firestore and
 * answered by the backend: `send` hands a message over and returns, the answer (and
 * a character update, when it leads to one) arrives through the live messages, also
 * after the app was closed in between.
 */
@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private readonly firebase = inject(FirebaseService);
  private readonly repositories = inject(ChatRepositoryFactory);
  private readonly toastService = inject(ToastService);

  private readonly characterId = signal<string | null>(null);
  private currentCharacter: DndCharacter | null = null;

  private readonly conversationLimit = signal(CONVERSATION_PAGE);
  private readonly messageLimit = signal(MESSAGE_PAGE);
  private readonly conversationList = new LiveList<ChatConversation>();
  private readonly messageList = new LiveList<StoredChatMessage>();
  private shownConversationsOf: string | null = null;
  private shownMessagesOf: string | null = null;

  private readonly localMessages = signal<LocalMessage[]>([]);
  /** Opening a character shows its latest conversation, unless the user got ahead of it. */
  private openLatestWhenLoaded = false;
  private readonly now = signal(Date.now());

  /** The conversation on screen; null is a new one that has no messages yet. */
  readonly activeChatId = signal<string | null>(null);

  readonly conversations: Signal<ChatConversation[]> = this.conversationList.items;
  readonly hasMoreConversations = computed(() => this.conversations().length >= this.conversationLimit());
  readonly activeConversation = computed(() =>
    this.conversations().find(conversation => conversation.id === this.activeChatId()) ?? null
  );

  readonly messages = computed<Message[]>(() => {
    const stored = this.messageList.items();
    const storedIds = new Set(stored.map(message => message.id));
    const chatId = this.activeChatId();
    const now = this.now();
    return [
      ...stored.map(message => toViewMessage(message, now)),
      ...this.localMessages()
        .filter(local => local.chatId === chatId && !storedIds.has(local.message.id))
        .map(local => local.message),
    ];
  });
  readonly hasEarlierMessages = computed(() => this.messageList.items().length >= this.messageLimit());
  /** True while the open conversation waits for an answer. */
  readonly isBusy = computed(() => this.messages().some(message => message.inProgress));

  constructor() {
    effect(() => {
      const characterId = this.characterId();
      const max = this.conversationLimit();
      untracked(() => {
        const sameCharacter = characterId !== null && characterId === this.shownConversationsOf;
        this.shownConversationsOf = characterId;
        this.conversationList.show(characterId ? this.repositories.chats(characterId, max) : null, sameCharacter);
      });
    });

    effect(() => {
      const characterId = this.characterId();
      const chatId = this.activeChatId();
      const max = this.messageLimit();
      untracked(() => {
        const key = characterId && chatId ? `${characterId}/${chatId}` : null;
        const sameChat = key !== null && key === this.shownMessagesOf;
        this.shownMessagesOf = key;
        this.messageList.show(
          characterId && chatId ? this.repositories.messages(characterId, chatId, max) : null,
          sameChat
        );
      });
    });

    effect(() => {
      if (!this.conversationList.loaded()) return;
      const latest = this.conversations()[0];
      untracked(() => {
        if (!this.openLatestWhenLoaded) return;
        this.openLatestWhenLoaded = false;
        if (latest && !this.activeChatId()) {
          this.activeChatId.set(latest.id);
        }
      });
    });

    // Without this a refused or failed read would only show as an empty list.
    effect(() => {
      const error = this.conversationList.error() ?? this.messageList.error();
      if (error) {
        logger.error('ChatService: could not load the conversations', error);
      }
    });

    // An answer that never arrives turns into an error after a while; that needs a clock.
    effect(onCleanup => {
      if (!this.isBusy() && !this.messages().some(message => message.isUpdatingCharacter)) return;
      const timer = setInterval(() => this.now.set(Date.now()), STALE_CHECK_INTERVAL_MS);
      onCleanup(() => clearInterval(timer));
    });
  }

  setCurrentCharacter(character: DndCharacter | null): void {
    this.currentCharacter = character;
  }

  /** The character whose conversations are shown; only its owner can read them, so pass null for anyone else. */
  setCharacterId(characterId: string | null): void {
    if (this.characterId() === characterId) return;
    this.characterId.set(characterId);
    this.activeChatId.set(null);
    this.localMessages.set([]);
    this.conversationLimit.set(CONVERSATION_PAGE);
    this.messageLimit.set(MESSAGE_PAGE);
    this.openLatestWhenLoaded = characterId !== null;
  }

  isImageGenerationRequest(message: string): boolean {
    return isImageRequest(message);
  }

  /** Start with an empty panel; the conversation is stored with its first message. */
  newChat(): void {
    this.openLatestWhenLoaded = false;
    this.activeChatId.set(null);
    this.messageLimit.set(MESSAGE_PAGE);
  }

  openChat(chatId: string): void {
    this.openLatestWhenLoaded = false;
    if (this.activeChatId() === chatId) return;
    this.messageLimit.set(MESSAGE_PAGE);
    this.activeChatId.set(chatId);
  }

  loadMoreConversations(): void {
    this.conversationLimit.update(max => max + CONVERSATION_PAGE);
  }

  loadEarlierMessages(): void {
    this.messageLimit.update(max => max + MESSAGE_PAGE);
  }

  /**
   * Send a message in the open conversation (or start one). The message and a waiting
   * answer are shown at once; from then on the backend owns the turn. A failure to
   * hand it over shows up as an error message in the conversation.
   */
  async send(text: string, attachment?: ChatAttachment): Promise<void> {
    const characterId = this.characterId();
    const character = this.currentCharacter;
    if (!characterId || !character) {
      logger.warn('ChatService: send without a character');
      return;
    }

    this.openLatestWhenLoaded = false;
    const chatId = this.activeChatId() ?? crypto.randomUUID();
    const userMessageId = crypto.randomUUID();
    const replyMessageId = crypto.randomUUID();
    const mode: ChatTurnMode = isImageRequest(text) ? 'image' : 'text';
    const sendsAttachment = mode === 'text' ? attachment : undefined;
    const timestamp = new Date();

    const storedIds = new Set(this.messageList.items().map(message => message.id));
    this.localMessages.update(list => [
      ...list.filter(local => !storedIds.has(local.message.id)),
      {
        chatId,
        message: {
          id: userMessageId,
          sender: 'user',
          text,
          timestamp,
          ...(sendsAttachment ? { pdfFileName: sendsAttachment.fileName } : {}),
        },
      },
      { chatId, message: { id: replyMessageId, sender: 'ai', text: '', timestamp, inProgress: true } },
    ]);
    this.activeChatId.set(chatId);

    try {
      const characterChat = httpsCallable<CharacterChatRequest, unknown>(
        this.firebase.requireFunctions(), 'characterChat', { timeout: SEND_TIMEOUT_MS }
      );
      await characterChat({
        characterId,
        chatId,
        userMessageId,
        replyMessageId,
        text,
        mode,
        currentCharacter: stripCharacterDetails(character),
        ...(sendsAttachment ? { attachment: sendsAttachment } : {}),
      });
    } catch (error) {
      const message = this.describeSendError(error);
      this.localMessages.update(list => list.map(local =>
        local.message.id === replyMessageId
          ? { ...local, message: { id: replyMessageId, sender: 'error', text: message, timestamp: new Date() } }
          : local
      ));
    }
  }

  async renameChat(chatId: string, title: string): Promise<void> {
    const characterId = this.characterId();
    const cleaned = title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_CHARS);
    if (!characterId || !cleaned) return;
    try {
      await this.repositories.chats(characterId, 1).patch(chatId, { title: cleaned, titleSource: 'user' });
    } catch (error) {
      logger.error('ChatService: could not rename the conversation', error);
      this.toastService.show('Hernoemen is niet gelukt.', 'error');
    }
  }

  /** Delete a conversation with its messages. Versions and images it led to stay with the character. */
  async deleteChat(chatId: string): Promise<void> {
    const characterId = this.characterId();
    if (!characterId) return;
    try {
      const deleteCharacterChat = httpsCallable<{ characterId: string; chatId: string }, unknown>(
        this.firebase.requireFunctions(), 'deleteCharacterChat'
      );
      await deleteCharacterChat({ characterId, chatId });
      if (this.activeChatId() === chatId) {
        this.newChat();
      }
    } catch (error) {
      this.toastService.showCallableError(error, 'Gesprek verwijderen is niet gelukt.');
      if (!isPermissionDenied(error)) {
        logger.error('ChatService: could not delete the conversation', error);
      }
    }
  }

  /** Stop a running character update: the backend then does not save the draft it is making. */
  async cancelCharacterUpdate(messageId: string): Promise<void> {
    const characterId = this.characterId();
    const chatId = this.activeChatId();
    if (!characterId || !chatId) return;
    try {
      await this.repositories.messages(characterId, chatId, 1).patch(messageId, { status: 'cancelled' });
    } catch (error) {
      // Too late: the update finished (or failed) in the meantime, and the message shows that.
      logger.warn('ChatService: could not cancel the character update', error);
    }
  }

  private describeSendError(error: unknown): string {
    if (isPermissionDenied(error)) {
      logger.warn('ChatService: permission denied by the backend');
      this.toastService.showCallableError(error);
      return PERMISSION_DENIED_MESSAGE;
    }

    logger.error('ChatService: could not send the message', error);
    switch (callableErrorCode(error)) {
      case 'unauthenticated':
        return 'Je bent niet ingelogd. Log opnieuw in en probeer het nog eens.';
      case 'invalid-argument':
        return 'Dit bericht kon niet worden verstuurd. Maak het korter of formuleer het anders.';
      case 'resource-exhausted':
        return 'Te veel verzoeken op dit moment. Wacht even en probeer het opnieuw.';
      case 'unavailable':
      case 'deadline-exceeded':
        return 'Geen verbinding met de server. Controleer je internetverbinding en probeer het opnieuw.';
      default:
        return 'Het bericht kon niet worden verstuurd. Probeer het opnieuw.';
    }
  }
}
