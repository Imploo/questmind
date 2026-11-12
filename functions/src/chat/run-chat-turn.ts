import type { Part } from '@google/genai';
import {
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import { executeGenerateCharacterDraft } from '../generate-character-draft';
import { generateCharacterImage, latestCharacterImagePath } from '../generate-image';
import { CHARACTER_RESPONDER_PROMPT } from '../prompts/character-responder.prompt';
import { CHAT_TITLE_INSTRUCTION } from '../prompts/chat-summary.prompt';
import type { ChatDoc, ChatHistoryMessage, ChatTurnPayload } from '../types/chat.types';
import { getAiFeatureConfig } from '../utils/ai-settings';
import { extractPartialJsonString, streamJson } from '../utils/gemini-client';
import * as logger from '../utils/logger';
import { captureFunctionError } from '../utils/sentry-error-handler';
import { deleteStorageFiles } from '../utils/storage-cleanup';
import {
  chatErrorCode,
  contextPreamble,
  imagePromptFrom,
  makePreview,
  sanitizeTitle,
  toHistory,
} from './chat-helpers';
import { chatRef, downloadAttachment, loadConversation, messagesRef } from './chat-store';
import { updateChatSummary } from './chat-summary';

/** Shortest time between two writes of an answer that is still being generated. */
const STREAM_WRITE_INTERVAL_MS = 500;

const IMAGE_PREVIEW = 'Afbeelding';

interface ResponderResult {
  text?: string;
  shouldUpdateCharacter?: boolean;
  title?: string;
}

type InlinePdf = { mimeType: string; data: string };

/**
 * One turn of a stored conversation: answer the user's message (or draw the
 * requested image), write the result to the reply message and, when the answer
 * calls for it, update the character. Runs in the task worker, so it finishes
 * whether or not the app is still open; the app follows along in Firestore.
 *
 * A failed answer is recorded on the reply message and rethrown for the caller to report.
 */
export async function runChatTurn(payload: ChatTurnPayload): Promise<void> {
  const db = getFirestore();
  const chat = chatRef(db, payload.characterId, payload.chatId);
  const reply = messagesRef(chat).doc(payload.replyMessageId);

  try {
    // A task can be delivered twice; only the first delivery finds the reply still pending.
    if (!(await claimReply(db, reply))) {
      logger.warn('characterChat: reply is not pending, turn skipped', {
        characterId: payload.characterId,
        chatId: payload.chatId,
        replyMessageId: payload.replyMessageId,
      });
      return;
    }

    try {
      if (payload.mode === 'image') {
        await runImageTurn(db, chat, reply, payload);
      } else {
        await runTextTurn(db, chat, reply, payload);
      }
    } catch (error) {
      // Text streamed before the failure is dropped; the error replaces it.
      await reply
        .update({ status: 'error', errorCode: chatErrorCode(error), text: '', updatedAt: FieldValue.serverTimestamp() })
        .catch(() => undefined);
      throw error;
    }
  } finally {
    if (payload.attachment) {
      await deleteStorageFiles([payload.attachment.storagePath]);
    }
  }
}

async function claimReply(db: Firestore, reply: DocumentReference): Promise<boolean> {
  return db.runTransaction(async tx => {
    const snapshot = await tx.get(reply);
    if (snapshot.get('status') !== 'pending') return false;
    tx.update(reply, { status: 'streaming', updatedAt: FieldValue.serverTimestamp() });
    return true;
  });
}

async function runTextTurn(
  db: Firestore,
  chat: DocumentReference,
  reply: DocumentReference,
  payload: ChatTurnPayload
): Promise<void> {
  const chatDoc = (await chat.get()).data() as ChatDoc | undefined;
  if (!chatDoc) return; // deleted while the task was waiting

  const history = toHistory(await loadConversation(chat, chatDoc.summarizedUntil));
  if (history[history.length - 1]?.role !== 'user') {
    throw new Error('Chat turn without a user message to answer');
  }
  const pdf = payload.attachment ? await downloadAttachment(payload.attachment) : null;
  const config = await getAiFeatureConfig('characterChatText');
  const wantsTitle = chatDoc.titleSource === 'auto';

  logger.info('characterChat: calling Gemini', {
    model: config.model,
    characterId: payload.characterId,
    chatId: payload.chatId,
    historyMessages: history.length,
    hasSummary: Boolean(chatDoc.summary),
    hasAttachment: Boolean(pdf),
  });

  const writer = new ReplyWriter(reply);
  const parsed = await streamJson<ResponderResult>({
    config,
    label: 'characterChat',
    contents: buildContents([...contextPreamble(payload.currentCharacter, chatDoc.summary), ...history], pdf),
    systemInstruction: CHARACTER_RESPONDER_PROMPT + (wantsTitle ? CHAT_TITLE_INSTRUCTION : ''),
    schema: responderSchema(wantsTitle),
    logContext: { characterId: payload.characterId, chatId: payload.chatId },
    onProgress: raw => writer.progress(extractPartialJsonString(raw, 'text')),
    onRetry: () => writer.reset(),
  });

  const text = parsed?.text?.trim();
  if (!text) {
    throw new Error('No response from AI model');
  }

  const title = wantsTitle ? sanitizeTitle(parsed.title) : null;
  if (!(await finishReply(db, chat, reply, { text, status: 'done' }, { lastMessagePreview: makePreview(text) }, title))) {
    return; // deleted while the answer was written
  }

  if (parsed.shouldUpdateCharacter === true) {
    await runCharacterUpdate(db, chat, payload, history, text, pdf);
  }

  try {
    await updateChatSummary(chat, config);
  } catch (error) {
    // The next turn simply sends a longer history and tries again.
    logger.warn('characterChat: could not update the chat summary', error);
  }
}

async function runImageTurn(
  db: Firestore,
  chat: DocumentReference,
  reply: DocumentReference,
  payload: ChatTurnPayload
): Promise<void> {
  const chatDoc = (await chat.get()).data() as ChatDoc | undefined;
  if (!chatDoc) return;

  const conversation = await loadConversation(chat, chatDoc.summarizedUntil);
  const request = conversation.find(message => message.id === payload.userMessageId)?.text ?? '';

  const image = await generateCharacterImage({
    characterId: payload.characterId,
    chatHistory: [
      ...contextPreamble(payload.currentCharacter, chatDoc.summary),
      ...toHistory(conversation),
      { role: 'user', content: imagePromptFrom(request) },
    ],
    referenceImageStoragePath: await latestCharacterImagePath(payload.characterId),
  });

  await finishReply(
    db,
    chat,
    reply,
    { images: [{ url: image.imageUrl, mimeType: image.mimeType }], status: 'done' },
    { lastMessagePreview: IMAGE_PREVIEW, hasImages: true },
    null
  );
}

/**
 * Store the finished reply and bring the chat's list entry up to date. The title is
 * only replaced while it is still the automatic one, so a rename by the owner wins.
 * False when the chat was deleted in the meantime.
 */
async function finishReply(
  db: Firestore,
  chat: DocumentReference,
  reply: DocumentReference,
  replyFields: Record<string, unknown>,
  chatFields: Record<string, unknown>,
  title: string | null
): Promise<boolean> {
  return db.runTransaction(async tx => {
    const snapshot = await tx.get(chat);
    if (!snapshot.exists) return false;
    const now = FieldValue.serverTimestamp();
    tx.update(reply, { ...replyFields, updatedAt: now });
    tx.update(chat, {
      ...chatFields,
      updatedAt: now,
      ...(title && snapshot.get('titleSource') === 'auto' ? { title, titleSource: 'ai' } : {}),
    });
    return true;
  });
}

/**
 * AI 2: turn the answer into a draft version of the character. Progress is shown by a
 * system message in the conversation; the owner can cancel it there, after which the
 * generated draft is not saved. A failure is reported here and does not fail the turn:
 * the answer itself is already stored.
 */
async function runCharacterUpdate(
  db: Firestore,
  chat: DocumentReference,
  payload: ChatTurnPayload,
  history: ChatHistoryMessage[],
  answer: string,
  pdf: InlinePdf | null
): Promise<void> {
  const update = messagesRef(chat).doc(`${payload.replyMessageId}-update`);
  const character = db.doc(`characters/${payload.characterId}`);
  const now = Timestamp.now();

  try {
    await update.create({
      id: update.id,
      sender: 'system',
      kind: 'characterUpdate',
      status: 'pending',
      text: '',
      createdAt: now,
      updatedAt: now,
    });
    await character.update({ isGenerating: true });

    const saved = await executeGenerateCharacterDraft(
      {
        characterId: payload.characterId,
        currentCharacter: payload.currentCharacter,
        chatHistory: history,
        ai1Response: answer,
        ...(pdf ? { pdfAttachment: pdf } : {}),
      },
      { shouldSave: async () => (await update.get()).get('status') === 'pending' }
    );
    if (!saved) return; // cancelled by the owner

    await update.update({
      status: 'done',
      versionId: saved.versionId,
      versionNumber: saved.versionNumber,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await chat.update({ updatedCharacter: true, lastVersionNumber: saved.versionNumber });
  } catch (error) {
    await character.update({ isGenerating: false }).catch(() => undefined);
    await markUpdateFailed(update).catch(() => undefined);
    captureFunctionError(
      'characterChatWorker',
      error instanceof Error ? error : new Error(String(error)),
      { characterId: payload.characterId, chatId: payload.chatId, step: 'characterUpdate' }
    );
  }
}

/** A cancelled update stays cancelled, also when the generation failed afterwards. */
async function markUpdateFailed(update: DocumentReference): Promise<void> {
  const snapshot = await update.get();
  if (snapshot.get('status') === 'pending') {
    await update.update({ status: 'error', updatedAt: FieldValue.serverTimestamp() });
  }
}

function buildContents(messages: ChatHistoryMessage[], pdf: InlinePdf | null): { role: string; parts: Part[] }[] {
  const contents = messages.map(message => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }] as Part[],
  }));
  // The PDF belongs to the question that was just asked: the last user message.
  const last = contents[contents.length - 1];
  if (pdf && last?.role === 'user') {
    last.parts.push({ inlineData: pdf });
  }
  return contents;
}

function responderSchema(withTitle: boolean): object {
  return {
    type: 'object',
    properties: {
      text: { type: 'string' },
      shouldUpdateCharacter: { type: 'boolean' },
      ...(withTitle ? { title: { type: 'string' } } : {}),
    },
    required: ['text', 'shouldUpdateCharacter', ...(withTitle ? ['title'] : [])],
    // Text first, so it can be shown while the rest is still generated.
    propertyOrdering: ['text', 'shouldUpdateCharacter', ...(withTitle ? ['title'] : [])],
  };
}

/**
 * Writes the answer generated so far to the reply message, at most once per
 * STREAM_WRITE_INTERVAL_MS, so the app can show it while it grows.
 */
class ReplyWriter {
  private lastWriteAt = 0;
  private written = '';

  constructor(private readonly reply: DocumentReference) {}

  async progress(text: string | undefined): Promise<void> {
    if (text === undefined || text === this.written) return;
    if (Date.now() - this.lastWriteAt < STREAM_WRITE_INTERVAL_MS) return;
    await this.write(text);
  }

  /** A retry starts the answer over: clear what was shown so far. */
  async reset(): Promise<void> {
    if (this.written) {
      await this.write('');
    }
  }

  private async write(text: string): Promise<void> {
    this.lastWriteAt = Date.now();
    this.written = text;
    await this.reply.update({ text, updatedAt: FieldValue.serverTimestamp() });
  }
}
