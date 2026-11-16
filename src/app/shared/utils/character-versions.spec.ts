import { describe, it, expect } from 'vitest';
import { CharacterVersion } from '../../core/models/schemas/character.schema';
import { activeVersionOf, pendingDraft } from './character-versions';

function version(versionNumber: number, isDraft = false): CharacterVersion {
  return { id: `v${versionNumber}`, versionNumber, isDraft } as CharacterVersion;
}

describe('pendingDraft', () => {
  it('is the newest version when that is a draft', () => {
    const draft = version(3, true);
    expect(pendingDraft([draft, version(2), version(1)])).toBe(draft);
  });

  it('is null when the newest version is saved, or when there are no versions', () => {
    expect(pendingDraft([version(2), version(1)])).toBeNull();
    expect(pendingDraft([])).toBeNull();
  });
});

describe('activeVersionOf', () => {
  const versions = [version(3), version(2), version(1)];

  it('is the version the tracker points at, also when a newer one exists', () => {
    expect(activeVersionOf(versions, 'v1')?.versionNumber).toBe(1);
  });

  it('falls back to the newest saved version when the tracked one is missing', () => {
    expect(activeVersionOf(versions, 'gone')?.versionNumber).toBe(3);
    expect(activeVersionOf(versions, undefined)?.versionNumber).toBe(3);
  });

  it('never is a draft', () => {
    const withDraft = [version(4, true), ...versions];
    expect(activeVersionOf(withDraft, 'v4')?.versionNumber).toBe(3);
    expect(activeVersionOf([version(1, true)], 'v1')).toBeNull();
  });
});
