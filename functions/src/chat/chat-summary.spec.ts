import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { FakeFirestore } from './testing/fake-firestore';

const mockGenerateText = vi.fn();
vi.mock('../utils/gemini-client', () => ({ generateText: (...args: unknown[]) => mockGenerateText(...args) }));
vi.mock('../prompts/chat-summary.prompt', () => ({ CHAT_SUMMARY_PROMPT: 'summary prompt' }));
vi.mock('../utils/logger', () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }));

import { updateChatSummary } from './chat-summary';

const CHAT = 'characters/char-1/chats/chat-1';
const config = { model: 'gemini-test', maxOutputTokens: 1024 };
const at = (ms: number) => Timestamp.fromMillis(1_700_000_000_000 + ms);

/** `count` finished questions and answers, alternating, numbered from `first`. */
function seedTurns(db: FakeFirestore, count: number, first = 0): void {
  for (let i = first; i < first + count; i++) {
    db.seed(`${CHAT}/messages/m${String(i).padStart(3, '0')}`, {
      sender: i % 2 === 0 ? 'user' : 'ai',
      kind: 'text',
      status: 'done',
      text: `bericht ${i}`,
      createdAt: at(i),
    });
  }
}

describe('updateChatSummary', () => {
  let db: FakeFirestore;
  const chat = () => db.doc(CHAT) as unknown as Parameters<typeof updateChatSummary>[0];

  beforeEach(() => {
    vi.clearAllMocks();
    db = new FakeFirestore();
    db.seed(CHAT, { id: 'chat-1', title: 'Spells' });
    mockGenerateText.mockResolvedValue('Mira koos Hypnotic Pattern.');
  });

  it('leaves a chat alone while its history still fits', async () => {
    seedTurns(db, 30);

    expect(await updateChatSummary(chat(), config)).toBe(false);

    expect(mockGenerateText).not.toHaveBeenCalled();
    expect(db.data(CHAT)?.summary).toBeUndefined();
  });

  it('folds everything but the last 20 messages into the summary', async () => {
    seedTurns(db, 34);

    expect(await updateChatSummary(chat(), config)).toBe(true);

    const request = mockGenerateText.mock.calls[0][0] as { contents: { text: string }[]; systemInstruction: string };
    expect(request.systemInstruction).toBe('summary prompt');
    expect(request.contents).toHaveLength(1);
    expect(request.contents[0].text).toContain('Gebruiker: bericht 0');
    expect(request.contents[0].text).toContain('The Sidekick: bericht 13');
    expect(request.contents[0].text).not.toContain('bericht 14');
    expect(db.data(CHAT)).toMatchObject({ summary: 'Mira koos Hypnotic Pattern.', summarizedUntil: at(13) });
  });

  it('builds on the earlier summary and only reads what came after it', async () => {
    db.seed(CHAT, { id: 'chat-1', summary: 'Eerder: Mira werd level 5.', summarizedUntil: at(13) });
    seedTurns(db, 14); // already summarized
    seedTurns(db, 32, 14);

    await updateChatSummary(chat(), config);

    const request = mockGenerateText.mock.calls[0][0] as { contents: { text: string }[] };
    expect(request.contents[0].text).toBe('Eerdere samenvatting:\nEerder: Mira werd level 5.');
    expect(request.contents[1].text).toContain('bericht 14');
    expect(request.contents[1].text).not.toContain('bericht 13');
    expect(request.contents[1].text).not.toContain('bericht 26');
    expect(db.data(CHAT)).toMatchObject({ summarizedUntil: at(25) });
  });

  it('does not count image requests, character updates or failed answers', async () => {
    seedTurns(db, 30);
    db.seed(`${CHAT}/messages/image`, { sender: 'user', kind: 'image', status: 'done', text: 'maak afbeelding', createdAt: at(100) });
    db.seed(`${CHAT}/messages/update`, { sender: 'system', kind: 'characterUpdate', status: 'done', text: '', createdAt: at(101) });
    db.seed(`${CHAT}/messages/failed`, { sender: 'ai', kind: 'text', status: 'error', text: '', createdAt: at(102) });

    expect(await updateChatSummary(chat(), config)).toBe(false);
  });

  it('does nothing for a chat that no longer exists', async () => {
    db.docs.delete(CHAT);

    expect(await updateChatSummary(chat(), config)).toBe(false);
  });
});
