import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { deleteApp, initializeApp } from 'firebase/app';
import { getFunctions } from 'firebase/functions';
import { CharacterImportService } from './character-import.service';
import { FirebaseService } from '../../../core/firebase.service';
import { ChatAttachment } from '../../../shared/utils/build-character-context';

describe('CharacterImportService', () => {
  const pdf: ChatAttachment = { type: 'pdf', fileName: 'sheet.pdf', mimeType: 'application/pdf', data: 'AAAA' };
  // A real Functions instance of a made-up project, with the network replaced. The specs share
  // their modules, so mocking `firebase/functions` only works for the spec that loads the service first.
  const app = initializeApp({ projectId: 'demo-questmind', apiKey: 'test', appId: 'test' }, 'character-import-spec');
  const functions = getFunctions(app, 'europe-west1');
  const fetchMock = vi.fn<(url: string, init: { body: string }) => Promise<unknown>>();
  let service: CharacterImportService;

  /** What the backend was asked: the name of the function and the data it got. */
  const request = () => {
    const [url, init] = fetchMock.mock.calls[0];
    return { name: url.split('/').pop(), data: (JSON.parse(init.body) as { data: unknown }).data };
  };
  const respondWith = (result: unknown) => fetchMock.mockResolvedValue({ status: 200, json: async () => ({ result }) });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: FirebaseService, useValue: { requireFunctions: () => functions } },
      ],
    });
    service = TestBed.inject(CharacterImportService);
  });

  afterEach(() => vi.unstubAllGlobals());
  afterAll(() => deleteApp(app));

  it('asks the backend to copy the character behind a link', async () => {
    respondWith({ characterId: 'new-id' });

    expect(await service.importFromLink('https://questmind.nl/share/character/abc')).toBe('new-id');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(request()).toEqual({ name: 'importCharacter', data: { link: 'https://questmind.nl/share/character/abc' } });
  });

  it('asks the backend to clone a character of this environment by id', async () => {
    respondWith({ characterId: 'clone-id' });

    expect(await service.cloneCharacter('abc')).toBe('clone-id');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(request()).toEqual({ name: 'importCharacter', data: { characterId: 'abc' } });
  });

  it('hands a queued PDF out once, and only to its own character', () => {
    service.queuePdf('char-1', pdf);

    expect(service.takePdf('char-2')).toBeNull();
    expect(service.takePdf('char-1')).toEqual(pdf);
    expect(service.takePdf('char-1')).toBeNull();
  });
});
