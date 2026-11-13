import type { CollectionReference, DocumentReference, Firestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import type { ChatMessageDoc, StoredChatAttachment } from '../types/chat.types';

/** Most messages read for one turn; the summary normally keeps a conversation far below this. */
const MAX_LOADED_MESSAGES = 200;

export function chatRef(db: Firestore, characterId: string, chatId: string): DocumentReference {
  return db.doc(`characters/${characterId}/chats/${chatId}`);
}

export function messagesRef(chat: DocumentReference): CollectionReference {
  return chat.collection('messages');
}

/** Folder of the PDFs parked for the running turns of one chat. Not readable by clients. */
export function chatAttachmentPrefix(characterId: string, chatId: string): string {
  return `chat-attachments/${characterId}/${chatId}/`;
}

export function chatAttachmentPath(characterId: string, chatId: string, messageId: string): string {
  return `${chatAttachmentPrefix(characterId, chatId)}${messageId}.pdf`;
}

/** The messages of a chat written after `after` (all of them without it), oldest first. */
export async function loadConversation(chat: DocumentReference, after?: Timestamp): Promise<ChatMessageDoc[]> {
  const messages = messagesRef(chat);
  const query = (after ? messages.where('createdAt', '>', after) : messages)
    .orderBy('createdAt', 'desc')
    .limit(MAX_LOADED_MESSAGES);
  const snapshot = await query.get();
  return snapshot.docs.map(doc => ({ ...(doc.data() as ChatMessageDoc), id: doc.id })).reverse();
}

/** The parked PDF as inline data for Gemini. */
export async function downloadAttachment(
  attachment: StoredChatAttachment
): Promise<{ mimeType: string; data: string }> {
  const [buffer] = await getStorage().bucket().file(attachment.storagePath).download();
  return { mimeType: attachment.mimeType, data: buffer.toString('base64') };
}
