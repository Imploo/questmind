import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { deleteApp, initializeApp } from 'firebase/app';
import { Timestamp } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

// These tests talk to the real Functions SDK and catch its HTTP request. The test files
// share their modules, so a mock of the SDK from another spec must not leak in here.
vi.unmock('firebase/functions');

import { ChatService } from './chat.service';
import { StoredChatMessage } from './chat.models';
import { FirebaseService } from '../core/firebase.service';
import { en } from '../core/i18n/en';
import { I18nService } from '../core/i18n/i18n.service';
import type { LanguageCode } from '../core/i18n/language-strategy';
import { nl } from '../core/i18n/nl';
import { provideTestLanguage } from '../core/i18n/testing';
import { DndCharacter } from '../shared/models/dnd-character.model';
import { ChatRepositoryFactory } from '../shared/repository/chat.repository';
import { ToastService } from '../shared/services/toast.service';

describe('ChatService', () => {
  const character = { name: 'Mira' } as DndCharacter;
  const app = initializeApp({ projectId: 'demo-questmind', apiKey: 'test', appId: 'test' }, 'chat-service-spec');
  const functions = getFunctions(app, 'europe-west1');
  const fetchMock = vi.fn<(url: string, init: { body: string }) => Promise<unknown>>();
  const storedMessages = signal<StoredChatMessage[]>([]);
  const chatPatch = vi.fn();
  const toast = { show: vi.fn(), showCallableError: vi.fn() };

  const source = <T>(rows: () => T[]) => ({
    get: rows,
    error: signal(null),
    waitForData: () => Promise.resolve(),
    destroy: vi.fn(),
  });
  const repositories = {
    chats: () => ({ ...source(signal([])), patch: chatPatch }),
    messages: () => ({ ...source(storedMessages), patch: vi.fn() }),
  };

  let service: ChatService;
  let i18n: I18nService;

  const setup = (language?: LanguageCode) => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        ...(language ? [provideTestLanguage(language)] : []),
        { provide: FirebaseService, useValue: { requireFunctions: () => functions } },
        { provide: ChatRepositoryFactory, useValue: repositories },
        { provide: ToastService, useValue: toast },
      ],
    });
    service = TestBed.inject(ChatService);
    i18n = TestBed.inject(I18nService);
    service.setCurrentCharacter(character);
    service.setCharacterId('char-1');
  };

  /** A response of the backend as the SDK reads it. */
  const response = (status: number, body: unknown) => Promise.resolve({ status, json: () => Promise.resolve(body) });
  /** The callable the last request went to. */
  const calledFunction = () => String(fetchMock.mock.calls.at(-1)?.[0]).split('/').pop();
  /** The request the last message was sent with. */
  const sentRequest = () =>
    (JSON.parse(fetchMock.mock.calls.at(-1)?.[1].body ?? '{}') as { data: Record<string, unknown> }).data;
  /** The text shown where the answer should have been. */
  const shownFailure = () => service.messages().find(message => message.sender === 'error')?.text;

  /** Let the backend refuse the next calls the way an `HttpsError` arrives: a status, a message, the reason in the details. */
  const refuseWith = (code: string, reason?: string) => {
    const httpStatus: Record<string, number> = {
      'invalid-argument': 400,
      unauthenticated: 401,
      'permission-denied': 403,
      'already-exists': 409,
      'resource-exhausted': 429,
      internal: 500,
      unavailable: 503,
      'deadline-exceeded': 504,
    };
    fetchMock.mockImplementation(() =>
      response(httpStatus[code], {
        error: {
          status: code.toUpperCase().replace(/-/g, '_'),
          message: 'Server text that must not be shown',
          ...(reason ? { details: { reason } } : {}),
        },
      })
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // The failures below are expected; what the logger writes about them does not belong in the test output.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(() => response(200, { result: {} }));
    storedMessages.set([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(() => deleteApp(app));

  describe('sending a message', () => {
    it('tells the backend which language The Sidekick has to answer in', async () => {
      setup();

      await service.send('Which spells fit me?');

      expect(calledFunction()).toBe('characterChat');
      expect(sentRequest()).toMatchObject({ characterId: 'char-1', text: 'Which spells fit me?', mode: 'text', language: 'en' });
    });

    it('sends the language the app is in at that moment', async () => {
      setup('nl');

      await service.send('Welke spells passen bij mij?');
      expect(sentRequest()['language']).toBe('nl');

      i18n.use('en');
      await service.send('And which feats?');
      expect(sentRequest()['language']).toBe('en');
    });

    it('asks for an image when the message does, in either language', async () => {
      setup();

      await service.send('maak afbeelding van Mira');
      expect(sentRequest()['mode']).toBe('image');

      await service.send('generate an image of Mira');
      expect(sentRequest()['mode']).toBe('image');
    });
  });

  describe('a message the backend refuses', () => {
    it('explains the reason the backend gave, never its own text', async () => {
      setup();
      refuseWith('invalid-argument', 'message-length');

      await service.send('x');

      expect(shownFailure()).toBe(en.errors.reasons.messageLength);
    });

    it.each([
      ['message-already-sent', 'already-exists', en.errors.reasons.messageAlreadySent],
      ['attachment-not-pdf', 'invalid-argument', en.errors.reasons.attachmentNotPdf],
      ['attachment-too-large', 'invalid-argument', en.errors.reasons.attachmentTooLarge],
    ])('has a text for the reason %s', async (reason, code, text) => {
      setup();
      refuseWith(code, reason);

      await service.send('x');

      expect(shownFailure()).toBe(text);
    });

    it.each([
      ['unauthenticated', en.errors.unauthenticated],
      ['resource-exhausted', en.errors.tooManyRequests],
      ['unavailable', en.errors.unavailable],
      ['deadline-exceeded', en.errors.unavailable],
    ])('explains the error code %s', async (code, text) => {
      setup();
      refuseWith(code);

      await service.send('x');

      expect(shownFailure()).toBe(text);
    });

    it('falls back on its own message for anything else', async () => {
      setup();
      refuseWith('internal');
      await service.send('x');
      expect(shownFailure()).toBe(en.chat.reply.sendFailed);

      fetchMock.mockImplementation(() => Promise.reject(new Error('network down')));
      service.newChat();
      await service.send('y');
      expect(shownFailure()).toBe(en.chat.reply.sendFailed);
    });

    it('says who may do this when access is refused, in the conversation and as a toast', async () => {
      setup('nl');
      refuseWith('permission-denied');

      await service.send('x');

      expect(shownFailure()).toBe(nl.errors.permissionDenied);
      expect(toast.showCallableError).toHaveBeenCalledWith(expect.objectContaining({ code: 'functions/permission-denied' }));
    });

    it('answers in Dutch when the app is Dutch', async () => {
      setup('nl');
      refuseWith('invalid-argument', 'attachment-too-large');
      await service.send('x');
      expect(shownFailure()).toBe(nl.errors.reasons.attachmentTooLarge);

      refuseWith('internal');
      service.newChat();
      await service.send('y');
      expect(shownFailure()).toBe(nl.chat.reply.sendFailed);
    });
  });

  describe('an open conversation', () => {
    const at = Timestamp.fromDate(new Date());
    const message = (overrides: Partial<StoredChatMessage>): StoredChatMessage =>
      ({ id: 'm1', sender: 'ai', kind: 'text', status: 'done', text: '', createdAt: at, updatedAt: at, ...overrides });

    it('switches what the app itself says when the language changes', () => {
      setup('nl');
      storedMessages.set([
        message({ id: 'update', sender: 'system', kind: 'characterUpdate', versionNumber: 3 }),
        message({ id: 'failed', status: 'error', errorCode: 'internal' }),
      ]);
      service.openChat('chat-1');
      TestBed.tick();

      expect(service.messages().map(shown => shown.text)).toEqual([nl.chat.characterUpdate.done, nl.chat.reply.failed]);

      i18n.use('en');

      expect(service.messages().map(shown => shown.text)).toEqual([en.chat.characterUpdate.done, en.chat.reply.failed]);
    });

    it('keeps what was written in the conversation as it is', () => {
      setup('nl');
      storedMessages.set([
        message({ id: 'question', sender: 'user', text: 'Welke spells passen bij mij?' }),
        message({ id: 'answer', text: 'Kies Hypnotic Pattern.' }),
      ]);
      service.openChat('chat-1');
      TestBed.tick();

      i18n.use('en');

      expect(service.messages().map(shown => shown.text)).toEqual(['Welke spells passen bij mij?', 'Kies Hypnotic Pattern.']);
    });
  });

  describe('the history', () => {
    it('reports a failed rename in the active language', async () => {
      setup('nl');
      chatPatch.mockRejectedValue(new Error('offline'));

      await service.renameChat('chat-1', 'Nieuwe titel');

      expect(toast.show).toHaveBeenCalledWith(nl.chat.history.renameFailed, 'error');
    });

    it('reports a failed delete in the active language', async () => {
      setup();
      refuseWith('internal');

      await service.deleteChat('chat-1');

      expect(calledFunction()).toBe('deleteCharacterChat');
      expect(toast.showCallableError)
        .toHaveBeenCalledWith(expect.objectContaining({ code: 'functions/internal' }), en.chat.history.deleteFailed);
    });
  });
});
