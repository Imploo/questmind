import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { captureFunctionError, wrapCallable } from './utils/sentry-error-handler';
import { SHARED_CORS } from './config/cors';
import { ensureAuthForTesting } from './utils/emulator-helpers';
import { assertCharacterOwner, assertValidId, requireAuthUid } from './utils/access';
import { deleteStorageFiles } from './utils/storage-cleanup';
import * as logger from './utils/logger';
import { TASK_WORKERS, TASK_WORKER_TIMEOUT_SECONDS, enqueueWorkerTask } from './services/task-queue.service';
import { DndCharacter } from './schemas/dnd-character.schema';
import {
  ChatAttachment,
  ChatTurnMode,
  ChatTurnPayload,
  StoredChatAttachment,
} from './types/chat.types';
import { MAX_MESSAGE_CHARS, isClientId, makeAutoTitle, makePreview } from './chat/chat-helpers';
import { chatAttachmentPath, chatAttachmentPrefix, chatRef, messagesRef } from './chat/chat-store';
import { runChatTurn } from './chat/run-chat-turn';

export interface CharacterChatRequest {
  characterId: string;
  /** Made up by the client: a new id starts a new chat, a known id continues that chat. */
  chatId: string;
  /** Ids for the two messages of this turn, so the client can show them before they are stored. */
  userMessageId: string;
  replyMessageId: string;
  text: string;
  /** `image`: draw a portrait instead of answering. */
  mode?: ChatTurnMode;
  /** The character as the owner sees it right now, without spell and feature descriptions. */
  currentCharacter: DndCharacter;
  attachment?: ChatAttachment;
}

export interface CharacterChatResponse {
  chatId: string;
  userMessageId: string;
  replyMessageId: string;
}

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
/** A task payload is limited to ~1 MB; the character travels in it. */
const MAX_CHARACTER_JSON_CHARS = 600_000;
const FIRESTORE_ALREADY_EXISTS = 6;

/**
 * Send a message in a stored conversation with The Sidekick. The message and an
 * empty reply are written to `characters/{id}/chats/{chatId}/messages`, the turn
 * is handed to `characterChatWorker` and the call returns at once. The worker
 * writes the answer (and a character update, when the answer calls for one) to
 * Firestore, so the turn completes even when the app is closed in the meantime.
 */
export const characterChat = onCall(
  { cors: SHARED_CORS, memory: '512MiB' },
  wrapCallable<CharacterChatRequest, CharacterChatResponse>(
    'characterChat',
    async (request): Promise<CharacterChatResponse> => {
      ensureAuthForTesting(request);
      const uid = requireAuthUid(request);

      const data = request.data ?? ({} as Partial<CharacterChatRequest>);
      const characterId = assertValidId(data.characterId, 'characterId');
      const { chatId, userMessageId, replyMessageId, currentCharacter } = data;
      if (!isClientId(chatId) || !isClientId(userMessageId) || !isClientId(replyMessageId)
        || userMessageId === replyMessageId) {
        throw new HttpsError('invalid-argument', 'Missing or invalid chatId, userMessageId or replyMessageId.');
      }

      const text = typeof data.text === 'string' ? data.text.trim() : '';
      if (!text || text.length > MAX_MESSAGE_CHARS) {
        throw new HttpsError('invalid-argument', `A message needs 1 to ${MAX_MESSAGE_CHARS} characters.`);
      }
      if (!currentCharacter || typeof currentCharacter !== 'object'
        || JSON.stringify(currentCharacter).length > MAX_CHARACTER_JSON_CHARS) {
        throw new HttpsError('invalid-argument', 'Missing or too large currentCharacter.');
      }

      const mode: ChatTurnMode = data.mode === 'image' ? 'image' : 'text';
      // An image request is answered with a portrait; a PDF sent along with it is not used.
      const attachment = mode === 'text' ? validateAttachment(data.attachment) : null;

      const db = getFirestore();
      await assertCharacterOwner(db, characterId, uid);

      const chat = chatRef(db, characterId, chatId);
      const userMessage = messagesRef(chat).doc(userMessageId);
      const reply = messagesRef(chat).doc(replyMessageId);
      const stored = attachment ? await storeAttachment(characterId, chatId, userMessageId, attachment) : null;

      try {
        const sentAt = Date.now();
        const userCreatedAt = Timestamp.fromMillis(sentAt);
        // One millisecond later, so the reply always sorts after the question.
        const replyCreatedAt = Timestamp.fromMillis(sentAt + 1);
        const listEntry = {
          lastMessagePreview: makePreview(text),
          updatedAt: userCreatedAt,
          ...(stored ? { hasPdf: true } : {}),
        };

        await db.runTransaction(async tx => {
          const existing = await tx.get(chat);
          if (existing.exists) {
            tx.update(chat, listEntry);
          } else {
            tx.create(chat, {
              id: chatId,
              title: makeAutoTitle(text, mode, stored?.fileName),
              titleSource: 'auto',
              createdAt: userCreatedAt,
              ...listEntry,
            });
          }
          tx.create(userMessage, {
            id: userMessageId,
            sender: 'user',
            kind: mode,
            status: 'done',
            text,
            ...(stored ? { pdfFileName: stored.fileName } : {}),
            createdAt: userCreatedAt,
            updatedAt: userCreatedAt,
          });
          tx.create(reply, {
            id: replyMessageId,
            sender: 'ai',
            kind: mode,
            status: 'pending',
            text: '',
            createdAt: replyCreatedAt,
            updatedAt: replyCreatedAt,
          });
        });
      } catch (error) {
        if (stored) await deleteStorageFiles([stored.storagePath]);
        if ((error as { code?: unknown })?.code === FIRESTORE_ALREADY_EXISTS) {
          throw new HttpsError('already-exists', 'This message was already sent.');
        }
        throw error;
      }

      const payload: ChatTurnPayload = {
        characterId,
        chatId,
        userMessageId,
        replyMessageId,
        mode,
        currentCharacter,
        attachment: stored,
      };

      try {
        // Via JSON: a task payload cannot hold undefined values.
        await enqueueWorkerTask(TASK_WORKERS.characterChat, JSON.parse(JSON.stringify(payload)));
      } catch (error) {
        // Nobody will answer this turn: say so on the reply instead of leaving it pending.
        await reply
          .update({ status: 'error', errorCode: 'internal', updatedAt: FieldValue.serverTimestamp() })
          .catch(() => undefined);
        if (stored) await deleteStorageFiles([stored.storagePath]);
        throw error;
      }

      return { chatId, userMessageId, replyMessageId };
    }
  )
);

/**
 * Task worker behind `characterChat`: answers the turn with its own time budget,
 * independent of the request that started it. Not retried by Cloud Tasks: a
 * failure is written to the reply message by runChatTurn and reported once, here.
 */
export const characterChatWorker = onTaskDispatched<ChatTurnPayload>(
  {
    timeoutSeconds: TASK_WORKER_TIMEOUT_SECONDS,
    memory: '1GiB',
    secrets: ['GOOGLE_AI_API_KEY'],
    retryConfig: { maxAttempts: 1 },
  },
  async (request) => {
    try {
      await runChatTurn(request.data);
    } catch (error) {
      captureFunctionError(
        'characterChatWorker',
        error instanceof Error ? error : new Error(String(error)),
        { characterId: request.data.characterId, chatId: request.data.chatId, mode: request.data.mode }
      );
    }
  }
);

export interface DeleteCharacterChatRequest {
  characterId: string;
  chatId: string;
}

/**
 * Delete a conversation with all its messages. Versions and images that came out
 * of it stay with the character.
 */
export const deleteCharacterChat = onCall(
  { cors: SHARED_CORS, memory: '256MiB' },
  wrapCallable<DeleteCharacterChatRequest, { success: boolean }>(
    'deleteCharacterChat',
    async (request): Promise<{ success: boolean }> => {
      ensureAuthForTesting(request);
      const uid = requireAuthUid(request);

      const characterId = assertValidId(request.data?.characterId, 'characterId');
      const chatId = assertValidId(request.data?.chatId, 'chatId');

      const db = getFirestore();
      await assertCharacterOwner(db, characterId, uid);
      await db.recursiveDelete(chatRef(db, characterId, chatId));

      // A PDF of a turn that is still running; the worker would remove it later anyway.
      await getStorage().bucket()
        .deleteFiles({ prefix: chatAttachmentPrefix(characterId, chatId) })
        .catch((error: unknown) => logger.warn('deleteCharacterChat: could not remove parked attachments', error));

      return { success: true };
    }
  )
);

function validateAttachment(attachment: unknown): ChatAttachment | null {
  if (attachment === undefined || attachment === null) return null;
  const { fileName, mimeType, data } = attachment as Partial<ChatAttachment>;
  if (typeof fileName !== 'string' || !fileName.trim() || typeof data !== 'string' || !data) {
    throw new HttpsError('invalid-argument', 'Invalid attachment.');
  }
  if (mimeType !== 'application/pdf') {
    throw new HttpsError('invalid-argument', 'Only PDF attachments are supported.');
  }
  if (Buffer.byteLength(data, 'base64') > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new HttpsError('invalid-argument', `Attachment "${fileName}" exceeds 10 MB limit`);
  }
  return { type: 'pdf', fileName: fileName.trim().slice(0, 200), mimeType, data };
}

/** Park the PDF in Storage for the worker, which removes it when the turn is over. */
async function storeAttachment(
  characterId: string,
  chatId: string,
  messageId: string,
  attachment: ChatAttachment
): Promise<StoredChatAttachment> {
  const storagePath = chatAttachmentPath(characterId, chatId, messageId);
  await getStorage().bucket().file(storagePath).save(Buffer.from(attachment.data, 'base64'), {
    metadata: { contentType: attachment.mimeType },
  });
  return { storagePath, mimeType: attachment.mimeType, fileName: attachment.fileName };
}
