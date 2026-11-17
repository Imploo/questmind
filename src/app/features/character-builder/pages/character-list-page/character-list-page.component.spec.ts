import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router } from '@angular/router';
import { CharacterListPageComponent } from './character-list-page.component';
import { CharacterService } from '../../../../core/services/character.service';
import { CharacterVersionService } from '../../../../core/services/character-version.service';
import { CharacterImageService } from '../../../../core/services/character-image.service';
import { CharacterImportService } from '../../services/character-import.service';
import { I18nService } from '../../../../core/i18n/i18n.service';
import { provideTestLanguage } from '../../../../core/i18n/testing';
import { en } from '../../../../core/i18n/en';
import { nl } from '../../../../core/i18n/nl';

describe('CharacterListPageComponent', () => {
  const characterService = { getCharacters: vi.fn(), createCharacter: vi.fn(), setArchived: vi.fn() };
  const versionService = { getVersion: vi.fn() };
  const imageService = { getImages: vi.fn() };
  const importService = { importFromLink: vi.fn(), queuePdf: vi.fn() };
  const router = { navigate: vi.fn() };

  const stored = (id: string) => ({ id, name: `Stored ${id}`, activeVersionId: 'v1', archived: false });

  async function setup(language: 'nl' | 'en', characters: ReturnType<typeof stored>[] = []): Promise<ComponentFixture<CharacterListPageComponent>> {
    characterService.getCharacters.mockResolvedValue(characters);
    TestBed.configureTestingModule({
      providers: [
        provideTestLanguage(language),
        { provide: CharacterService, useValue: characterService },
        { provide: CharacterVersionService, useValue: versionService },
        { provide: CharacterImageService, useValue: imageService },
        { provide: CharacterImportService, useValue: importService },
        { provide: Router, useValue: router },
      ],
    });
    const fixture = TestBed.createComponent(CharacterListPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const element = (fixture: ComponentFixture<CharacterListPageComponent>) => fixture.nativeElement as HTMLElement;
  const alert = (fixture: ComponentFixture<CharacterListPageComponent>) =>
    element(fixture).querySelector('app-import-character-dialog [role="alert"]')?.textContent?.trim();

  beforeEach(() => {
    vi.clearAllMocks();
    characterService.createCharacter.mockResolvedValue('new-id');
    versionService.getVersion.mockResolvedValue({ character: { name: 'Mira', class: 'Druid', race: 'Wood Elf', level: 5 } });
    imageService.getImages.mockResolvedValue([]);
  });

  describe('a new character', () => {
    it('gets a Dutch default name when the app is in Dutch; class, race and language stay game terms', async () => {
      const fixture = await setup('nl');

      await fixture.componentInstance.onCreateCharacter();

      const [name, data] = characterService.createCharacter.mock.calls[0];
      expect(name).toBe('Nieuw karakter 1');
      expect(data).toMatchObject({ name: 'Nieuw karakter 1', class: 'Fighter', race: 'Human', languages: ['Common'] });
      expect(router.navigate).toHaveBeenCalledWith(['/characters', 'new-id']);
    });

    it('gets an English default name when the app is in English, numbered after the characters there are', async () => {
      const fixture = await setup('en', [stored('a'), stored('b')]);

      await fixture.componentInstance.onCreateCharacter();

      const [name, data] = characterService.createCharacter.mock.calls[0];
      expect(name).toBe('New Character 3');
      expect(data).toMatchObject({ name: 'New Character 3', class: 'Fighter', race: 'Human', languages: ['Common'] });
    });
  });

  describe('the list', () => {
    it('shows the texts of the active language and switches with it', async () => {
      const fixture = await setup('en');

      expect(element(fixture).querySelector('h1')?.textContent).toBe(en.characters.list.title);
      expect(element(fixture).querySelector('.qm-empty-title')?.textContent).toBe(en.characters.list.emptyTitle);

      TestBed.inject(I18nService).use('nl');
      fixture.detectChanges();

      expect(element(fixture).querySelector('h1')?.textContent).toBe(nl.characters.list.title);
      expect(element(fixture).querySelector('.qm-empty-title')?.textContent).toBe(nl.characters.list.emptyTitle);
    });

    it('describes a character by its race and class, and says so when they could not be read', async () => {
      versionService.getVersion.mockResolvedValueOnce({ character: { name: 'Mira', class: 'Druid', race: 'Wood Elf', level: 5 } });
      versionService.getVersion.mockRejectedValueOnce(new Error('offline'));
      const fixture = await setup('nl', [stored('a'), stored('b')]);

      const subtitles = Array.from(element(fixture).querySelectorAll('app-character-tile .qm-eyebrow')).map(tile => tile.textContent);

      expect(subtitles).toEqual(['Wood Elf Druid', `${nl.common.unknown} ${nl.common.unknown}`]);
    });
  });

  describe('importing', () => {
    async function open(language: 'nl' | 'en'): Promise<ComponentFixture<CharacterListPageComponent>> {
      const fixture = await setup(language);
      fixture.componentInstance.openImport();
      fixture.detectChanges();
      return fixture;
    }

    it('explains a refused link in the language of the user, not with the text of the server', async () => {
      importService.importFromLink.mockRejectedValue({
        code: 'functions/invalid-argument',
        message: 'Only links to a QuestMind character can be imported.',
        details: { reason: 'import-link-not-questmind' },
      });
      const fixture = await open('nl');

      await fixture.componentInstance.onImportLink('https://example.com/x');
      fixture.detectChanges();

      expect(alert(fixture)).toBe(nl.errors.reasons.importLinkNotQuestmind);
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('falls back on a general import message for an error without a reason', async () => {
      importService.importFromLink.mockRejectedValue({ code: 'functions/internal', message: 'INTERNAL' });
      const fixture = await open('en');

      await fixture.componentInstance.onImportLink('https://questmind.app/share/character/abc');
      fixture.detectChanges();

      expect(alert(fixture)).toBe(en.characters.importDialog.failed);
    });

    it('refuses a file that is not a PDF before making a character for it', async () => {
      const fixture = await open('en');

      await fixture.componentInstance.onImportPdf(new File(['x'], 'sheet.png', { type: 'image/png' }));
      fixture.detectChanges();

      expect(alert(fixture)).toBe(en.errors.reasons.attachmentNotPdf);
      expect(characterService.createCharacter).not.toHaveBeenCalled();
    });

    it('says the PDF could not be imported when making the character fails, without the raw error', async () => {
      characterService.createCharacter.mockRejectedValue(new Error('Missing or insufficient permissions.'));
      const fixture = await open('nl');

      await fixture.componentInstance.onImportPdf(new File(['%PDF-1.7'], 'sheet.pdf', { type: 'application/pdf' }));
      fixture.detectChanges();

      expect(alert(fixture)).toBe(nl.characters.importDialog.pdfFailed);
      expect(importService.queuePdf).not.toHaveBeenCalled();
    });
  });
});
