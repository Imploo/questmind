import { TestBed } from '@angular/core/testing';
import { Timestamp } from 'firebase/firestore';
import { describe, it, expect, vi } from 'vitest';
import { CharacterVersion } from '../../../../core/models/schemas/character.schema';
import { CharacterVersionHistoryComponent } from './character-version-history.component';

function version(versionNumber: number): CharacterVersion {
  return {
    id: `v${versionNumber}`,
    versionNumber,
    commitMessage: `Change ${versionNumber}`,
    source: 'ai',
    createdAt: Timestamp.fromMillis(0),
  } as CharacterVersion;
}

describe('CharacterVersionHistoryComponent', () => {
  function setup(versions: CharacterVersion[], activeVersionId: string) {
    const fixture = TestBed.createComponent(CharacterVersionHistoryComponent);
    fixture.componentRef.setInput('versions', versions);
    fixture.componentRef.setInput('activeVersionId', activeVersionId);
    const activate = vi.fn();
    fixture.componentInstance.activate.subscribe(activate);
    fixture.detectChanges();
    const entries = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.entry'));
    return { entries, activate };
  }

  it('marks the active version, also when it is not the newest', () => {
    const { entries } = setup([version(3), version(2), version(1)], 'v2');

    expect(entries.map(entry => entry.classList.contains('is-active'))).toEqual([false, true, false]);
    expect(entries[1].querySelector('.qm-badge')?.textContent?.trim()).toBe('Active');
    expect(entries[1].querySelector('button')).toBeNull();
    expect(entries[0].querySelector('.qm-badge')).toBeNull();
  });

  it('offers every other version to switch to', () => {
    const { entries, activate } = setup([version(3), version(2), version(1)], 'v2');

    entries[2].querySelector('button')!.click();

    expect(activate).toHaveBeenCalledTimes(1);
    expect(activate.mock.calls[0][0].id).toBe('v1');
  });
});
