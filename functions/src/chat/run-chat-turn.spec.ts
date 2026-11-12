import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { FakeFirestore } from './testing/fake-firestore';
import type { ChatTurnPayload } from '../types/chat.types';
import type { DndCharacter } from '../schemas/dnd-character.schema';

// ── Mocks ────────────────────────────────────────────────────────────────────

const fake = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }));
vi.mock('firebase-admin/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase-admin/firestore')>('firebase-admin/firestore');
  return { ...actual, getFirestore: () => fake.db };
});

const mockDownload = vi.fn();
const mockDeleteFile = vi.fn();
vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({
    bucket: () => ({ file: (path: string) => ({ download: () => mockDownload(path), delete: () => mockDeleteFile(path) }) }),
  }),
}));

// Non-stream responses from `mockGenerateContent` are replayed as a one-chunk stream;
// `mockStreamChunks` queues multi-chunk streams instead.
const mockGenerateContent = vi.fn();
const mockStreamChunks: Record<string, unknown>[][] = [];
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: mockGenerateContent,
      generateContentStream: async (...args: unknown[]) => {
        const chunks = mockStreamChunks.shift() ?? [await mockGenerateContent(...args)];
        return (async function* () {
          yield* chunks;
        })();
      },
    };
  },
}));

vi.mock('../utils/ai-settings', () => ({
  getAiFeatureConfig: vi.fn(() => Promise.resolve({ model: 'gemini-test', maxOutputTokens: 4096 })),
}));
vi.mock('../prompts/character-responder.prompt', () => ({ CHARACTER_RESPONDER_PROMPT: 'responder prompt' }));
vi.mock('../prompts/chat-summary.prompt', () => ({ CHAT_TITLE_INSTRUCTION: ' +title', CHAT_SUMMARY_PROMPT: 'summary prompt' }));
vi.mock('../utils/logger', () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }));

const mockCaptureFunctionError = vi.fn();
vi.mock('../utils/sentry-error-handler', () => ({
  captureFunctionError: (...args: unknown[]) => mockCaptureFunctionError(...args),
}));

const mockGenerateDraft = vi.fn();
vi.mock('../generate-character-draft', () => ({
  executeGenerateCharacterDraft: (...args: unknown[]) => mockGenerateDraft(...args),
}));

const mockGenerateImage = vi.fn();
const mockLatestImagePath = vi.fn();
vi.mock('../generate-image', () => ({
  generateCharacterImage: (...args: unknown[]) => mockGenerateImage(...args),
  latestCharacterImagePath: (...args: unknown[]) => mockLatestImagePath(...args),
}));

const mockUpdateSummary = vi.fn();
vi.mock('./chat-summary', () => ({ updateChatSummary: (...args: unknown[]) => mockUpdateSummary(...args) }));

import { runChatTurn } from './run-chat-turn';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const CHAT = 'characters/char-1/chats/chat-1';
const USER = `${CHAT}/messages/user-msg`;
const REPLY = `${CHAT}/messages/reply-msg`;
const UPDATE = `${CHAT}/messages/reply-msg-update`;
const CHARACTER = 'characters/char-1';
const character = { name: 'Mira', class: 'Bard' } as unknown as DndCharacter;

const at = (ms: number) => Timestamp.fromMillis(1_700_000_000_000 + ms);

function payload(overrides: Partial<ChatTurnPayload> = {}): ChatTurnPayload {
  return {
    characterId: 'char-1',
    chatId: 'chat-1',
    userMessageId: 'user-msg',
    replyMessageId: 'reply-msg',
    mode: 'text',
    currentCharacter: character,
    attachment: null,
    ...overrides,
  };
}

/** A chat with one question and its waiting reply, as `characterChat` leaves it. */
function seedTurn(question = 'Welke spells raad je aan?', chat: Record<string, unknown> = {}, kind = 'text'): void {
  fake.db.seed(CHARACTER, { userId: 'owner-1' });
  fake.db.seed(CHAT, { id: 'chat-1', title: question, titleSource: 'auto', lastMessagePreview: question, ...chat });
  fake.db.seed(USER, { id: 'user-msg', sender: 'user', kind, status: 'done', text: question, createdAt: at(1000), updatedAt: at(1000) });
  fake.db.seed(REPLY, { id: 'reply-msg', sender: 'ai', kind, status: 'pending', text: '', createdAt: at(1001), updatedAt: at(1001) });
}

const answer = (fields: Record<string, unknown>) => ({ text: JSON.stringify(fields) });

// ── Tests ────────────────────────────────────────────────────────────────────

describe('runChatTurn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateContent.mockReset();
    mockStreamChunks.length = 0;
    mockDeleteFile.mockResolvedValue(undefined);
    mockUpdateSummary.mockResolvedValue(false);
    process.env.GOOGLE_AI_API_KEY = 'test-google-key';
    fake.db = new FakeFirestore();
  });

  describe('answering a question', () => {
    it('writes the answer to the reply message and updates the chat', async () => {
      seedTurn();
      mockGenerateContent.mockResolvedValueOnce(
        answer({ text: 'Kies **Hypnotic Pattern**.', shouldUpdateCharacter: false, title: 'Spells voor level 5' })
      );

      await runChatTurn(payload());

      expect(fake.db.data(REPLY)).toMatchObject({ status: 'done', text: 'Kies **Hypnotic Pattern**.' });
      expect(fake.db.data(CHAT)).toMatchObject({
        lastMessagePreview: 'Kies Hypnotic Pattern.',
        title: 'Spells voor level 5',
        titleSource: 'ai',
      });
      expect(mockGenerateDraft).not.toHaveBeenCalled();
    });

    it('sends the character, the summary and the stored history to the model', async () => {
      seedTurn('En daarna?', { summary: 'Mira koos Hypnotic Pattern.', summarizedUntil: at(500), titleSource: 'ai' });
      // Already covered by the summary: must not be sent again.
      fake.db.seed(`${CHAT}/messages/old`, { sender: 'user', kind: 'text', status: 'done', text: 'Oude vraag', createdAt: at(400) });
      fake.db.seed(`${CHAT}/messages/q1`, { sender: 'user', kind: 'text', status: 'done', text: 'Eerdere vraag', createdAt: at(600) });
      fake.db.seed(`${CHAT}/messages/a1`, { sender: 'ai', kind: 'text', status: 'done', text: 'Eerder antwoord', createdAt: at(601) });
      mockGenerateContent.mockResolvedValueOnce(answer({ text: 'Dan Dispel Magic.', shouldUpdateCharacter: false }));

      await runChatTurn(payload());

      const request = mockGenerateContent.mock.calls[0][0] as {
        contents: { role: string; parts: { text: string }[] }[];
        config: { systemInstruction: string; responseSchema: { required: string[] } };
      };
      expect(request.contents.map(content => [content.role, content.parts[0].text])).toEqual([
        ['user', 'Huidig karakter:\n{"name":"Mira","class":"Bard"}'],
        ['model', 'Karakter ontvangen, zal het inlezen.'],
        ['user', 'Samenvatting van het eerdere deel van dit gesprek:\nMira koos Hypnotic Pattern.'],
        ['model', 'Duidelijk, ik neem dit mee.'],
        ['user', 'Eerdere vraag'],
        ['model', 'Eerder antwoord'],
        ['user', 'En daarna?'],
      ]);
      // The chat already has a model-written title, so no new one is asked for.
      expect(request.config.systemInstruction).toBe('responder prompt');
      expect(request.config.responseSchema.required).toEqual(['text', 'shouldUpdateCharacter']);
    });

    it('asks for a title while the chat still has its automatic one', async () => {
      seedTurn();
      mockGenerateContent.mockResolvedValueOnce(answer({ text: 'Antwoord', shouldUpdateCharacter: false, title: 'Titel' }));

      await runChatTurn(payload());

      const request = mockGenerateContent.mock.calls[0][0] as {
        config: { systemInstruction: string; responseSchema: { required: string[] } };
      };
      expect(request.config.systemInstruction).toBe('responder prompt +title');
      expect(request.config.responseSchema.required).toContain('title');
    });

    it('keeps a title the owner chose while the answer was being written', async () => {
      seedTurn();
      mockGenerateContent.mockImplementationOnce(async () => {
        fake.db.seed(CHAT, { ...fake.db.data(CHAT), title: 'Mijn titel', titleSource: 'user' });
        return answer({ text: 'Antwoord', shouldUpdateCharacter: false, title: 'Titel van de AI' });
      });

      await runChatTurn(payload());

      expect(fake.db.data(CHAT)).toMatchObject({ title: 'Mijn titel', titleSource: 'user' });
    });

    it('shows the answer while it is being generated', async () => {
      seedTurn();
      mockStreamChunks.push([
        { text: '{"text": "Kies Hyp' },
        { text: 'notic Pattern.", "shouldUpdateCharacter": false, "title": "Spells"}' },
      ]);

      await runChatTurn(payload());

      const texts = fake.db.writesTo(REPLY).map(write => write.data?.text).filter(text => text !== undefined);
      expect(texts).toEqual(['Kies Hyp', 'Kies Hypnotic Pattern.']);
      expect(fake.db.data(REPLY)).toMatchObject({ status: 'done', text: 'Kies Hypnotic Pattern.' });
    });

    it('updates the summary of a long chat afterwards, and survives a failure there', async () => {
      seedTurn();
      mockGenerateContent.mockResolvedValueOnce(answer({ text: 'Antwoord', shouldUpdateCharacter: false, title: 'Titel' }));
      mockUpdateSummary.mockRejectedValueOnce(new Error('summary failed'));

      await expect(runChatTurn(payload())).resolves.toBeUndefined();

      expect(mockUpdateSummary).toHaveBeenCalledOnce();
      expect(fake.db.data(REPLY)).toMatchObject({ status: 'done' });
    });

    it('does nothing when the task is delivered a second time', async () => {
      seedTurn();
      fake.db.seed(REPLY, { ...fake.db.data(REPLY), status: 'done', text: 'Al beantwoord' });

      await runChatTurn(payload());

      expect(mockGenerateContent).not.toHaveBeenCalled();
      expect(fake.db.data(REPLY)).toMatchObject({ status: 'done', text: 'Al beantwoord' });
    });

    it('stops quietly when the chat was deleted in the meantime', async () => {
      seedTurn();
      mockGenerateContent.mockImplementationOnce(async () => {
        fake.db.docs.delete(CHAT);
        return answer({ text: 'Antwoord', shouldUpdateCharacter: true, title: 'Titel' });
      });

      await expect(runChatTurn(payload())).resolves.toBeUndefined();

      expect(mockGenerateDraft).not.toHaveBeenCalled();
    });
  });

  describe('a failed answer', () => {
    it('is recorded on the reply message, without the text streamed so far', async () => {
      seedTurn();
      mockGenerateContent.mockResolvedValue({ text: '{"text": "afgebroken' });

      await expect(runChatTurn(payload())).rejects.toThrow();

      expect(fake.db.data(REPLY)).toMatchObject({ status: 'error', errorCode: 'internal', text: '' });
    });

    it('tells a rate limit apart', async () => {
      seedTurn();
      mockGenerateContent.mockRejectedValueOnce(new Error('got status: 429 Too Many Requests'));

      await expect(runChatTurn(payload())).rejects.toThrow('429');

      expect(fake.db.data(REPLY)).toMatchObject({ status: 'error', errorCode: 'resource-exhausted' });
    });

    it('fails when the model returns no text', async () => {
      seedTurn();
      mockGenerateContent.mockResolvedValue(answer({ text: '  ', shouldUpdateCharacter: false }));

      await expect(runChatTurn(payload())).rejects.toThrow('No response from AI model');

      expect(fake.db.data(REPLY)).toMatchObject({ status: 'error' });
    });
  });

  describe('a PDF sent along', () => {
    const attachment = { storagePath: 'chat-attachments/char-1/chat-1/user-msg.pdf', mimeType: 'application/pdf', fileName: 'mira.pdf' };

    it('goes to the model with the question and is removed afterwards', async () => {
      seedTurn('Import this character');
      mockDownload.mockResolvedValueOnce([Buffer.from('%PDF-1.7')]);
      mockGenerateContent.mockResolvedValueOnce(answer({ text: 'Gelezen.', shouldUpdateCharacter: false, title: 'Import' }));

      await runChatTurn(payload({ attachment }));

      const request = mockGenerateContent.mock.calls[0][0] as { contents: { parts: unknown[] }[] };
      expect(request.contents[request.contents.length - 1].parts).toEqual([
        { text: 'Import this character' },
        { inlineData: { mimeType: 'application/pdf', data: Buffer.from('%PDF-1.7').toString('base64') } },
      ]);
      expect(mockDeleteFile).toHaveBeenCalledWith(attachment.storagePath);
    });

    it('is also removed when the answer fails', async () => {
      seedTurn('Import this character');
      mockDownload.mockRejectedValueOnce(new Error('storage down'));

      await expect(runChatTurn(payload({ attachment }))).rejects.toThrow('storage down');

      expect(mockDeleteFile).toHaveBeenCalledWith(attachment.storagePath);
    });
  });

  describe('a character update', () => {
    const updateAnswer = answer({ text: 'Ik voeg Hypnotic Pattern toe.', shouldUpdateCharacter: true, title: 'Spells' });

    it('generates the draft and links it to the conversation', async () => {
      seedTurn('Doe Hypnotic Pattern.');
      mockGenerateContent.mockResolvedValueOnce(updateAnswer);
      mockGenerateDraft.mockResolvedValueOnce({ versionId: 'version-7', versionNumber: 7 });

      await runChatTurn(payload());

      expect(mockGenerateDraft).toHaveBeenCalledWith(
        {
          characterId: 'char-1',
          currentCharacter: character,
          chatHistory: [{ role: 'user', content: 'Doe Hypnotic Pattern.' }],
          ai1Response: 'Ik voeg Hypnotic Pattern toe.',
        },
        { shouldSave: expect.any(Function) }
      );
      expect(fake.db.data(UPDATE)).toMatchObject({
        sender: 'system',
        kind: 'characterUpdate',
        status: 'done',
        versionId: 'version-7',
        versionNumber: 7,
      });
      expect(fake.db.data(CHAT)).toMatchObject({ updatedCharacter: true, lastVersionNumber: 7 });
      expect(fake.db.writesTo(CHARACTER)[0].data).toEqual({ isGenerating: true });
    });

    it('shows the update as running while the draft is generated', async () => {
      seedTurn('Doe Hypnotic Pattern.');
      mockGenerateContent.mockResolvedValueOnce(updateAnswer);
      mockGenerateDraft.mockImplementationOnce(async () => {
        expect(fake.db.data(UPDATE)).toMatchObject({ status: 'pending' });
        expect(fake.db.data(REPLY)).toMatchObject({ status: 'done' });
        return { versionId: 'version-7', versionNumber: 7 };
      });

      await runChatTurn(payload());

      expect(mockGenerateDraft).toHaveBeenCalledOnce();
    });

    it('does not save the draft after the owner cancelled', async () => {
      seedTurn('Doe Hypnotic Pattern.');
      mockGenerateContent.mockResolvedValueOnce(updateAnswer);
      mockGenerateDraft.mockImplementationOnce(async (_payload, options: { shouldSave: () => Promise<boolean> }) => {
        expect(await options.shouldSave()).toBe(true);
        // What the app does when the owner presses "Annuleren".
        fake.db.seed(UPDATE, { ...fake.db.data(UPDATE), status: 'cancelled' });
        expect(await options.shouldSave()).toBe(false);
        return null;
      });

      await runChatTurn(payload());

      expect(fake.db.data(UPDATE)).toMatchObject({ status: 'cancelled' });
      expect(fake.db.data(CHAT)?.updatedCharacter).toBeUndefined();
    });

    it('marks the update as failed and reports it, but keeps the answer', async () => {
      seedTurn('Doe Hypnotic Pattern.');
      mockGenerateContent.mockResolvedValueOnce(updateAnswer);
      mockGenerateDraft.mockRejectedValueOnce(new Error('draft failed'));

      await expect(runChatTurn(payload())).resolves.toBeUndefined();

      expect(fake.db.data(UPDATE)).toMatchObject({ status: 'error' });
      expect(fake.db.data(REPLY)).toMatchObject({ status: 'done', text: 'Ik voeg Hypnotic Pattern toe.' });
      expect(fake.db.data(CHARACTER)).toMatchObject({ isGenerating: false });
      expect(mockCaptureFunctionError).toHaveBeenCalledWith(
        'characterChatWorker',
        expect.objectContaining({ message: 'draft failed' }),
        expect.objectContaining({ step: 'characterUpdate' })
      );
    });

    it('passes the PDF on to the draft generator', async () => {
      seedTurn('Import this character');
      mockDownload.mockResolvedValueOnce([Buffer.from('%PDF-1.7')]);
      mockGenerateContent.mockResolvedValueOnce(updateAnswer);
      mockGenerateDraft.mockResolvedValueOnce({ versionId: 'version-2', versionNumber: 2 });

      await runChatTurn(payload({
        attachment: { storagePath: 'chat-attachments/char-1/chat-1/user-msg.pdf', mimeType: 'application/pdf', fileName: 'mira.pdf' },
      }));

      expect(mockGenerateDraft.mock.calls[0][0]).toMatchObject({
        pdfAttachment: { mimeType: 'application/pdf', data: Buffer.from('%PDF-1.7').toString('base64') },
      });
    });
  });

  describe('an image request', () => {
    it('draws the portrait from the conversation and stores it on the reply', async () => {
      seedTurn('maak afbeelding Mira bij een kampvuur', {}, 'image');
      fake.db.seed(`${CHAT}/messages/q1`, { sender: 'user', kind: 'text', status: 'done', text: 'Ze draagt een rode mantel.', createdAt: at(100) });
      fake.db.seed(`${CHAT}/messages/a1`, { sender: 'ai', kind: 'text', status: 'done', text: 'Genoteerd.', createdAt: at(101) });
      mockLatestImagePath.mockResolvedValueOnce('images/char-1/previous.png');
      mockGenerateImage.mockResolvedValueOnce({ imageUrl: 'https://storage/new.png', mimeType: 'image/png' });

      await runChatTurn(payload({ mode: 'image' }));

      expect(mockGenerateImage).toHaveBeenCalledWith({
        characterId: 'char-1',
        chatHistory: [
          { role: 'user', content: 'Huidig karakter:\n{"name":"Mira","class":"Bard"}' },
          { role: 'assistant', content: 'Karakter ontvangen, zal het inlezen.' },
          { role: 'user', content: 'Ze draagt een rode mantel.' },
          { role: 'assistant', content: 'Genoteerd.' },
          { role: 'user', content: 'Mira bij een kampvuur' },
        ],
        referenceImageStoragePath: 'images/char-1/previous.png',
      });
      expect(fake.db.data(REPLY)).toMatchObject({
        status: 'done',
        images: [{ url: 'https://storage/new.png', mimeType: 'image/png' }],
      });
      expect(fake.db.data(CHAT)).toMatchObject({ hasImages: true, lastMessagePreview: 'Afbeelding' });
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('records a failed image on the reply', async () => {
      seedTurn('maak afbeelding', {}, 'image');
      mockLatestImagePath.mockResolvedValueOnce(null);
      mockGenerateImage.mockRejectedValueOnce(new HttpsError('resource-exhausted', 'Rate limit exceeded.'));

      await expect(runChatTurn(payload({ mode: 'image' }))).rejects.toThrow('Rate limit exceeded.');

      expect(fake.db.data(REPLY)).toMatchObject({ status: 'error', errorCode: 'resource-exhausted' });
    });
  });
});
