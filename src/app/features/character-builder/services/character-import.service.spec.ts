import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

const callable = vi.fn();
const httpsCallable = vi.fn<(functions: unknown, name: string) => typeof callable>(() => callable);
vi.mock('firebase/functions', () => ({
  httpsCallable: (functions: unknown, name: string) => httpsCallable(functions, name),
}));

import { CharacterImportService } from './character-import.service';
import { FirebaseService } from '../../../core/firebase.service';
import { ChatAttachment } from '../../../shared/utils/build-character-context';

describe('CharacterImportService', () => {
  const pdf: ChatAttachment = { type: 'pdf', fileName: 'sheet.pdf', mimeType: 'application/pdf', data: 'AAAA' };
  let service: CharacterImportService;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: FirebaseService, useValue: { requireFunctions: () => 'functions' } },
      ],
    });
    service = TestBed.inject(CharacterImportService);
  });

  it('asks the backend to copy the character behind a link', async () => {
    callable.mockResolvedValue({ data: { characterId: 'new-id' } });

    expect(await service.importFromLink('https://questmind.nl/share/character/abc')).toBe('new-id');
    expect(httpsCallable).toHaveBeenCalledWith('functions', 'importCharacter');
    expect(callable).toHaveBeenCalledWith({ link: 'https://questmind.nl/share/character/abc' });
  });

  it('asks the backend to clone a character of this environment by id', async () => {
    callable.mockResolvedValue({ data: { characterId: 'clone-id' } });

    expect(await service.cloneCharacter('abc')).toBe('clone-id');
    expect(httpsCallable).toHaveBeenCalledWith('functions', 'importCharacter');
    expect(callable).toHaveBeenCalledWith({ characterId: 'abc' });
  });

  it('hands a queued PDF out once, and only to its own character', () => {
    service.queuePdf('char-1', pdf);

    expect(service.takePdf('char-2')).toBeNull();
    expect(service.takePdf('char-1')).toEqual(pdf);
    expect(service.takePdf('char-1')).toBeNull();
  });
});
