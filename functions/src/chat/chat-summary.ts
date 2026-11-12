import type { DocumentReference } from 'firebase-admin/firestore';
import { CHAT_SUMMARY_PROMPT } from '../prompts/chat-summary.prompt';
import type { AIFeatureConfig } from '../types/audio-session.types';
import type { ChatDoc, ChatMessageDoc } from '../types/chat.types';
import { generateText } from '../utils/gemini-client';
import * as logger from '../utils/logger';
import { HISTORY_WINDOW, SUMMARY_SLACK } from './chat-helpers';
import { loadConversation } from './chat-store';

const isTextTurn = (message: ChatMessageDoc): boolean =>
  message.kind === 'text' && message.status === 'done' && message.sender !== 'system' && !!message.text.trim();

/**
 * Keep a long conversation affordable: once more than HISTORY_WINDOW + SUMMARY_SLACK
 * questions and answers are waiting to be sent as history, fold the oldest ones into
 * the chat's summary. The last HISTORY_WINDOW stay as they are.
 */
export async function updateChatSummary(chat: DocumentReference, config: AIFeatureConfig): Promise<boolean> {
  const chatDoc = (await chat.get()).data() as ChatDoc | undefined;
  if (!chatDoc) return false;

  const turns = (await loadConversation(chat, chatDoc.summarizedUntil)).filter(isTextTurn);
  if (turns.length <= HISTORY_WINDOW + SUMMARY_SLACK) return false;

  const older = turns.slice(0, turns.length - HISTORY_WINDOW);
  const transcript = older
    .map(message => `${message.sender === 'user' ? 'Gebruiker' : 'The Sidekick'}: ${message.text.trim()}`)
    .join('\n\n');

  const summary = await generateText({
    config,
    label: 'chatSummary',
    systemInstruction: CHAT_SUMMARY_PROMPT,
    contents: [
      ...(chatDoc.summary ? [{ text: `Eerdere samenvatting:\n${chatDoc.summary}` }] : []),
      { text: `Nieuwe berichten:\n${transcript}` },
    ],
    logContext: { chatId: chat.id, messages: older.length },
  });

  await chat.update({ summary, summarizedUntil: older[older.length - 1].createdAt });
  logger.info('chatSummary: summary updated', { chatId: chat.id, messages: older.length });
  return true;
}
