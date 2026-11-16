import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { CharacterEntryResolverService } from './character-entry-resolver.service';
import { FirebaseService } from '../firebase.service';
import { ResolutionContext } from '../../shared/utils/resolution-context';

describe('CharacterEntryResolverService', () => {
  // The bundled data is the 2014 SRD; a 2024 character must not be served from it.
  const http = { get: vi.fn(() => of([])) };
  let service: CharacterEntryResolverService;

  const fighter = (rulesVersion: ResolutionContext['rulesVersion']): ResolutionContext =>
    ({ class: 'Fighter', race: 'Human', level: 3, features: ['Second Wind'], rulesVersion });

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: HttpClient, useValue: http },
        { provide: FirebaseService, useValue: {} },
      ],
    });
    service = TestBed.inject(CharacterEntryResolverService);
  });

  it('has no bundled spell text for a 2024 character, and does not load the data for it', async () => {
    expect(await service.lookupSpellLocally('Magic Missile', fighter('2024'))).toBeNull();
    expect(http.get).not.toHaveBeenCalled();
  });

  it('has no bundled feature text for a 2024 character, and does not load the data for it', async () => {
    expect(await service.lookupFeatureLocally({ name: 'Second Wind', source: 'Class' }, fighter('2024'))).toBeNull();
    expect(http.get).not.toHaveBeenCalled();
  });
});
