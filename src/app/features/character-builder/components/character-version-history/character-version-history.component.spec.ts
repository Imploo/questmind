import { TestBed } from '@angular/core/testing';
import { Timestamp } from 'firebase/firestore';
import { describe, it, expect, vi } from 'vitest';
import { CharacterVersion } from '../../../../core/models/schemas/character.schema';
import { CharacterVersionHistoryComponent, commitMessageText, versionSourceText } from './character-version-history.component';
import { INITIAL_COMMIT_MESSAGE } from '../../../../core/services/character-version.service';
import { I18nService } from '../../../../core/i18n/i18n.service';
import { provideTestLanguage } from '../../../../core/i18n/testing';
import { formatDate } from '../../../../shared/formatting.service';
import { en } from '../../../../core/i18n/en';
import { nl } from '../../../../core/i18n/nl';

function version(versionNumber: number, overrides: Partial<CharacterVersion> = {}): CharacterVersion {
  return {
    id: `v${versionNumber}`,
    versionNumber,
    commitMessage: `Change ${versionNumber}`,
    source: 'ai',
    createdAt: Timestamp.fromMillis(0),
    ...overrides,
  } as CharacterVersion;
}

describe('commitMessageText', () => {
  it.each([
    [INITIAL_COMMIT_MESSAGE, nl.characters.history.commitInitial],
    ['Updated via AI chat', nl.characters.history.commitAi],
    ['Cloned from a shared character', nl.characters.history.commitCloned],
    ['Imported from questmind-beta.web.app', nl.characters.history.commitImported('questmind-beta.web.app')],
  ])('translates the fixed message "%s"', (stored, shown) => {
    expect(commitMessageText(stored, nl.characters.history)).toBe(shown);
    expect(commitMessageText(stored, en.characters.history)).toBe(stored);
  });

  it('shows what The Sidekick or a user wrote as it is stored', () => {
    expect(commitMessageText('Level 5: Extra Attack toegevoegd', en.characters.history)).toBe('Level 5: Extra Attack toegevoegd');
    expect(commitMessageText('Imported from a friend, with changes', nl.characters.history)).toBe('Imported from a friend, with changes');
  });
});

describe('versionSourceText', () => {
  it('names the sources the app knows and leaves any other as stored', () => {
    const texts = nl.characters.history;

    expect(versionSourceText('ai', texts)).toBe(texts.sourceAi);
    expect(versionSourceText('manual', texts)).toBe(texts.sourceManual);
    expect(versionSourceText('restore', texts)).toBe(texts.sourceRestore);
    expect(versionSourceText('migration', texts)).toBe('migration');
  });
});

describe('CharacterVersionHistoryComponent', () => {
  function setup(versions: CharacterVersion[], activeVersionId: string, language: 'nl' | 'en' = 'en') {
    TestBed.configureTestingModule({ providers: [provideTestLanguage(language)] });
    const fixture = TestBed.createComponent(CharacterVersionHistoryComponent);
    fixture.componentRef.setInput('versions', versions);
    fixture.componentRef.setInput('activeVersionId', activeVersionId);
    const activate = vi.fn();
    fixture.componentInstance.activate.subscribe(activate);
    fixture.detectChanges();
    const entries = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.entry'));
    return { fixture, entries, activate };
  }

  it('marks the active version, also when it is not the newest', () => {
    const { entries } = setup([version(3), version(2), version(1)], 'v2');

    expect(entries.map(entry => entry.classList.contains('is-active'))).toEqual([false, true, false]);
    expect(entries[1].querySelector('.qm-badge')?.textContent?.trim()).toBe(en.characters.history.active);
    expect(entries[1].querySelector('button')).toBeNull();
    expect(entries[0].querySelector('.qm-badge')).toBeNull();
  });

  it('offers every other version to switch to', () => {
    const { entries, activate } = setup([version(3), version(2), version(1)], 'v2');

    entries[2].querySelector('button')!.click();

    expect(activate).toHaveBeenCalledTimes(1);
    expect(activate.mock.calls[0][0].id).toBe('v1');
  });

  it('shows the version, its fixed message, its date and its source in Dutch', () => {
    const createdAt = Timestamp.fromDate(new Date(2026, 10, 6, 14, 30));
    const { entries } = setup([version(1, { commitMessage: INITIAL_COMMIT_MESSAGE, source: 'manual', createdAt })], 'v1', 'nl');
    const text = entries[0].textContent!.replace(/\s+/g, ' ');

    expect(text).toContain(nl.common.version(1));
    expect(text).toContain(nl.characters.history.commitInitial);
    expect(text).not.toContain(INITIAL_COMMIT_MESSAGE);
    expect(text).toContain(`${formatDate(createdAt.toDate(), 'nl-NL')} · ${nl.characters.history.sourceManual}`);
    expect(text).toContain('6 nov 2026');
  });

  it('switches with the language, date included', () => {
    const createdAt = Timestamp.fromDate(new Date(2026, 10, 6, 14, 30));
    const { fixture } = setup([version(1, { commitMessage: 'Updated via AI chat', createdAt })], 'v1');
    const text = () => (fixture.nativeElement as HTMLElement).querySelector('.entry')!.textContent!.replace(/\s+/g, ' ');

    expect(text()).toContain(en.characters.history.commitAi);
    expect(text()).toContain(formatDate(createdAt.toDate(), 'en-GB'));

    TestBed.inject(I18nService).use('nl');
    fixture.detectChanges();

    expect(text()).toContain(nl.characters.history.commitAi);
    expect(text()).toContain(formatDate(createdAt.toDate(), 'nl-NL'));
    expect(text()).toContain(nl.characters.history.active);
  });
});
