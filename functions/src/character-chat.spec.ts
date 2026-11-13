import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { FakeFirestore } from './chat/testing/fake-firestore';

// eslint-friendly stand-in for `Function` in handler mocks
type Handler = (...args: unknown[]) => Promise<unknown>;

// ── Mocks ────────────────────────────────────────────────────────────────────

const fake = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }));
vi.mock('firebase-admin/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase-admin/firestore')>('firebase-admin/firestore');
  return { ...actual, getFirestore: () => fake.db };
});

const savedFiles: Record<string, { data: Buffer; contentType: unknown }> = {};
const mockDeleteFile = vi.fn();
const mockDeleteFiles = vi.fn();
vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({
    bucket: () => ({
      file: (path: string) => ({
        save: async (data: Buffer, options: { metadata: { contentType: unknown } }) => {
          savedFiles[path] = { data, contentType: options.metadata.contentType };
        },
        delete: () => mockDeleteFile(path),
      }),
      deleteFiles: (options: unknown) => mockDeleteFiles(options),
    }),
  }),
}));

const mockEnqueue = vi.fn();
vi.mock('./services/task-queue.service', async () => {
  const actual = await vi.importActual<typeof import('./services/task-queue.service')>('./services/task-queue.service');
  return { ...actual, enqueueWorkerTask: (...args: unknown[]) => mockEnqueue(...args) };
});

const mockRunChatTurn = vi.fn();
vi.mock('./chat/run-chat-turn', () => ({ runChatTurn: (...args: unknown[]) => mockRunChatTurn(...args) }));

const mockCaptureFunctionError = vi.fn();
vi.mock('./utils/sentry-error-handler', () => ({
  wrapCallable: (_name: string, handler: Handler) => handler,
  captureFunctionError: (...args: unknown[]) => mockCaptureFunctionError(...args),
}));
vi.mock('./utils/emulator-helpers', () => ({ ensureAuthForTesting: vi.fn() }));
vi.mock('./utils/logger', () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }));

const mockAssertCharacterOwner = vi.fn();
vi.mock('./utils/access', async () => {
  const actual = await vi.importActual<typeof import('./utils/access')>('./utils/access');
  return { ...actual, assertCharacterOwner: (...args: unknown[]) => mockAssertCharacterOwner(...args) };
});

const handlers = vi.hoisted(() => ({ callables: [] as Handler[], worker: undefined as unknown as Handler }));
vi.mock('firebase-functions/v2/https', async () => {
  const actual = await vi.importActual<typeof import('firebase-functions/v2/https')>('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_config: unknown, handler: Handler) => {
      handlers.callables.push(handler);
      return handler;
    },
  };
});
vi.mock('firebase-functions/v2/tasks', () => ({
  onTaskDispatched: (_config: unknown, handler: Handler) => {
    handlers.worker = handler;
    return handler;
  },
}));

import './character-chat';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const [characterChat, deleteCharacterChat] = handlers.callables;

const CHAT_ID = '11111111-aaaa-4bbb-8ccc-000000000001';
const USER_ID = '11111111-aaaa-4bbb-8ccc-000000000002';
const REPLY_ID = '11111111-aaaa-4bbb-8ccc-000000000003';
const CHAT = `characters/char-1/chats/${CHAT_ID}`;
const USER = `${CHAT}/messages/${USER_ID}`;
const REPLY = `${CHAT}/messages/${REPLY_ID}`;
const character = { name: 'Mira', class: 'Bard' };
const pdf = { type: 'pdf', fileName: 'mira.pdf', mimeType: 'application/pdf', data: 'JVBERi0xLjQ=' };

function request(data: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}) {
  return {
    auth: { uid: 'owner-1' },
    data: {
      characterId: 'char-1',
      chatId: CHAT_ID,
      userMessageId: USER_ID,
      replyMessageId: REPLY_ID,
      text: 'Welke spells raad je aan?',
      currentCharacter: character,
      ...data,
    },
    ...overrides,
  };
}

const code = (c: string) => expect.objectContaining({ code: c });

beforeEach(() => {
  vi.clearAllMocks();
  fake.db = new FakeFirestore();
  for (const path of Object.keys(savedFiles)) delete savedFiles[path];
  mockAssertCharacterOwner.mockResolvedValue({ userId: 'owner-1' });
  mockEnqueue.mockResolvedValue(undefined);
  mockDeleteFile.mockResolvedValue(undefined);
  mockDeleteFiles.mockResolvedValue(undefined);
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('characterChat', () => {
  it('rejects unauthenticated callers', async () => {
    await expect(characterChat(request({}, { auth: null }))).rejects.toThrow(code('unauthenticated'));
  });

  it.each([
    ['a missing characterId', { characterId: '' }],
    ['a chat id that is not a client id', { chatId: 'chats/other' }],
    ['a missing reply id', { replyMessageId: undefined }],
    ['the same id for the message and its reply', { replyMessageId: USER_ID }],
    ['an empty message', { text: '   ' }],
    ['a message that is too long', { text: 'x'.repeat(8001) }],
    ['a missing character', { currentCharacter: null }],
    ['an attachment that is not a PDF', { attachment: { ...pdf, mimeType: 'image/png' } }],
    ['an attachment over 10 MB', { attachment: { ...pdf, data: Buffer.alloc(11 * 1024 * 1024).toString('base64') } }],
  ])('rejects %s', async (_case, data) => {
    await expect(characterChat(request(data))).rejects.toThrow(code('invalid-argument'));
    expect(fake.db.writes).toEqual([]);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('rejects callers who do not own the character, before anything is stored', async () => {
    mockAssertCharacterOwner.mockRejectedValueOnce(new HttpsError('permission-denied', 'Not authorized'));

    await expect(characterChat(request({ attachment: pdf }))).rejects.toThrow(code('permission-denied'));

    expect(mockAssertCharacterOwner).toHaveBeenCalledWith(expect.anything(), 'char-1', 'owner-1');
    expect(fake.db.writes).toEqual([]);
    expect(savedFiles).toEqual({});
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('starts a chat: stores the question and a waiting reply, and hands the turn to the worker', async () => {
    const result = await characterChat(request());

    expect(result).toEqual({ chatId: CHAT_ID, userMessageId: USER_ID, replyMessageId: REPLY_ID });
    expect(fake.db.data(CHAT)).toMatchObject({
      id: CHAT_ID,
      title: 'Welke spells raad je aan?',
      titleSource: 'auto',
      lastMessagePreview: 'Welke spells raad je aan?',
    });
    expect(fake.db.data(USER)).toMatchObject({ sender: 'user', kind: 'text', status: 'done', text: 'Welke spells raad je aan?' });
    expect(fake.db.data(REPLY)).toMatchObject({ sender: 'ai', kind: 'text', status: 'pending', text: '' });
    expect(mockEnqueue).toHaveBeenCalledWith('characterChatWorker', {
      characterId: 'char-1',
      chatId: CHAT_ID,
      userMessageId: USER_ID,
      replyMessageId: REPLY_ID,
      mode: 'text',
      currentCharacter: character,
      attachment: null,
    });
  });

  it('puts the reply right after the question', async () => {
    await characterChat(request());

    const asked = fake.db.data(USER)?.createdAt as { toMillis: () => number };
    const replied = fake.db.data(REPLY)?.createdAt as { toMillis: () => number };
    expect(replied.toMillis() - asked.toMillis()).toBe(1);
  });

  it('continues an existing chat without touching its title', async () => {
    fake.db.seed(CHAT, { id: CHAT_ID, title: 'Spells voor level 5', titleSource: 'ai', lastMessagePreview: 'Oud' });

    await characterChat(request({ text: 'En op level 6?' }));

    expect(fake.db.data(CHAT)).toMatchObject({
      title: 'Spells voor level 5',
      titleSource: 'ai',
      lastMessagePreview: 'En op level 6?',
    });
  });

  it('parks a PDF in Storage for the worker instead of sending it along with the task', async () => {
    await characterChat(request({ text: 'Import this character', attachment: pdf }));

    const storagePath = `chat-attachments/char-1/${CHAT_ID}/${USER_ID}.pdf`;
    expect(savedFiles[storagePath]).toEqual({ data: Buffer.from(pdf.data, 'base64'), contentType: 'application/pdf' });
    expect(fake.db.data(USER)).toMatchObject({ pdfFileName: 'mira.pdf' });
    expect(fake.db.data(CHAT)).toMatchObject({ title: 'Import: mira.pdf', hasPdf: true });
    expect(mockEnqueue.mock.calls[0][1]).toMatchObject({
      attachment: { storagePath, mimeType: 'application/pdf', fileName: 'mira.pdf' },
    });
  });

  it('marks an image request and leaves a PDF sent with it out', async () => {
    await characterChat(request({ text: 'maak afbeelding bij een kampvuur', mode: 'image', attachment: pdf }));

    expect(fake.db.data(USER)).toMatchObject({ kind: 'image' });
    expect(fake.db.data(REPLY)).toMatchObject({ kind: 'image', status: 'pending' });
    expect(fake.db.data(CHAT)).toMatchObject({ title: 'Afbeelding: bij een kampvuur' });
    expect(savedFiles).toEqual({});
    expect(mockEnqueue.mock.calls[0][1]).toMatchObject({ mode: 'image', attachment: null });
  });

  it('refuses a message that was already sent', async () => {
    await characterChat(request({ attachment: pdf }));
    mockEnqueue.mockClear();

    await expect(characterChat(request({ attachment: pdf }))).rejects.toThrow(code('already-exists'));

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('records on the reply that nobody will answer when the turn cannot be handed over', async () => {
    mockEnqueue.mockRejectedValueOnce(new Error('queue unavailable'));

    await expect(characterChat(request({ attachment: pdf }))).rejects.toThrow('queue unavailable');

    expect(fake.db.data(REPLY)).toMatchObject({ status: 'error', errorCode: 'internal' });
    expect(mockDeleteFile).toHaveBeenCalledWith(`chat-attachments/char-1/${CHAT_ID}/${USER_ID}.pdf`);
  });
});

describe('characterChatWorker', () => {
  const payload = { characterId: 'char-1', chatId: CHAT_ID, mode: 'text' };

  it('runs the turn', async () => {
    mockRunChatTurn.mockResolvedValueOnce(undefined);

    await handlers.worker({ data: payload });

    expect(mockRunChatTurn).toHaveBeenCalledWith(payload);
    expect(mockCaptureFunctionError).not.toHaveBeenCalled();
  });

  it('reports a failed turn once and does not let Cloud Tasks retry it', async () => {
    mockRunChatTurn.mockRejectedValueOnce(new Error('gemini down'));

    await expect(handlers.worker({ data: payload })).resolves.toBeUndefined();

    expect(mockCaptureFunctionError).toHaveBeenCalledWith(
      'characterChatWorker',
      expect.objectContaining({ message: 'gemini down' }),
      { characterId: 'char-1', chatId: CHAT_ID, mode: 'text' }
    );
  });
});

describe('deleteCharacterChat', () => {
  const deleteRequest = (overrides: Record<string, unknown> = {}) => ({
    auth: { uid: 'owner-1' },
    data: { characterId: 'char-1', chatId: CHAT_ID },
    ...overrides,
  });

  beforeEach(() => {
    fake.db.seed(CHAT, { id: CHAT_ID, title: 'Spells' });
    fake.db.seed(USER, { text: 'Vraag' });
    fake.db.seed(REPLY, { text: 'Antwoord' });
    fake.db.seed('characters/char-1/chats/other-chat', { title: 'Blijft staan' });
  });

  it('rejects unauthenticated callers', async () => {
    await expect(deleteCharacterChat(deleteRequest({ auth: null }))).rejects.toThrow(code('unauthenticated'));
  });

  it('rejects callers who do not own the character', async () => {
    mockAssertCharacterOwner.mockRejectedValueOnce(new HttpsError('permission-denied', 'Not authorized'));

    await expect(deleteCharacterChat(deleteRequest())).rejects.toThrow(code('permission-denied'));

    expect(fake.db.data(CHAT)).toBeDefined();
  });

  it('deletes the chat with its messages and nothing else', async () => {
    await expect(deleteCharacterChat(deleteRequest())).resolves.toEqual({ success: true });

    expect(fake.db.data(CHAT)).toBeUndefined();
    expect(fake.db.data(USER)).toBeUndefined();
    expect(fake.db.data(REPLY)).toBeUndefined();
    expect(fake.db.data('characters/char-1/chats/other-chat')).toBeDefined();
    expect(mockDeleteFiles).toHaveBeenCalledWith({ prefix: `chat-attachments/char-1/${CHAT_ID}/` });
  });
});
