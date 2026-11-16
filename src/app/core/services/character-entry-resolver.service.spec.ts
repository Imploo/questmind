import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';

const callable = vi.fn();
const httpsCallable = vi.fn<(functions: unknown, name: string) => typeof callable>(() => callable);
vi.mock('firebase/functions', () => ({
  httpsCallable: (functions: unknown, name: string) => httpsCallable(functions, name),
}));

import { CharacterEntryResolverService } from './character-entry-resolver.service';
import { FirebaseService } from '../firebase.service';
import { ResolutionContext, resolutionKey } from '../../shared/utils/resolution-context';

describe('CharacterEntryResolverService', () => {
  // The bundled data is the 2014 SRD; a 2024 character must not be served from it.
  const http = { get: vi.fn(() => of([])) };
  let service: CharacterEntryResolverService;

  const fighter = (rulesVersion?: ResolutionContext['rulesVersion']): ResolutionContext =>
    ({ class: 'Fighter', race: 'Human', level: 3, features: ['Second Wind'], rulesVersion });

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: HttpClient, useValue: http },
        { provide: FirebaseService, useValue: { requireFunctions: () => 'functions' } },
      ],
    });
    service = TestBed.inject(CharacterEntryResolverService);
  });

  it('asks the backend for the 2024 text of a spell the bundled data has under the 2014 rules', async () => {
    callable.mockResolvedValue({ data: { description: 'Three darts (2024).', usage: 'Casting Time: Action' } });

    const spell = await service.resolveSpell('char-1', { name: 'Magic Missile', level: 1, school: 'Evocation' }, fighter('2024'));

    expect(httpsCallable).toHaveBeenCalledWith('functions', 'resolveSpell');
    expect(callable).toHaveBeenCalledWith(expect.objectContaining({
      characterId: 'char-1', spellName: 'Magic Missile', characterClass: 'Fighter', characterLevel: 3, rulesVersion: '2024',
    }));
    expect(spell).toEqual({
      description: 'Three darts (2024).', usage: 'Casting Time: Action', resolvedFor: resolutionKey(fighter('2024')),
    });
    expect(http.get).not.toHaveBeenCalled();
  });

  it('asks the backend for the 2024 text of a feature the bundled data has under the 2014 rules', async () => {
    callable.mockResolvedValue({ data: { description: 'Regain hit points, twice (2024).' } });

    const feature = await service.resolveFeature('char-1', { name: 'Second Wind', source: 'Class' }, fighter('2024'));

    expect(httpsCallable).toHaveBeenCalledWith('functions', 'resolveFeature');
    expect(callable).toHaveBeenCalledWith(expect.objectContaining({ featureName: 'Second Wind', rulesVersion: '2024' }));
    expect(feature.description).toBe('Regain hit points, twice (2024).');
    expect(http.get).not.toHaveBeenCalled();
  });

  it('has no bundled text for a 2024 character, and does not load the data for it', async () => {
    expect(await service.lookupSpellLocally('Magic Missile', fighter('2024'))).toBeNull();
    expect(await service.lookupFeatureLocally({ name: 'Second Wind' }, fighter('2024'))).toBeNull();
    expect(http.get).not.toHaveBeenCalled();
  });
});
