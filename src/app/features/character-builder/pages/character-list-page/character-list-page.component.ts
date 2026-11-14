import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { CharacterService } from '../../../../core/services/character.service';
import { CharacterVersionService } from '../../../../core/services/character-version.service';
import { CharacterImageService } from '../../../../core/services/character-image.service';
import { Character } from '../../../../core/models/schemas/character.schema';
import { DndCharacter } from '../../../../shared/models/dnd-character.model';
import { CharacterImportService } from '../../services/character-import.service';
import { ImportCharacterDialogComponent } from '../../components/import-character-dialog/import-character-dialog.component';
import { CharacterTileComponent } from '../../components/character-tile/character-tile.component';
import { ToastService } from '../../../../shared/services/toast.service';
import { readPdfAttachment } from '../../../../chat/pdf-attachment';
import * as logger from '../../../../shared/logger';

interface CharacterSummary {
  id: string;
  name: string;
  class: string;
  race: string;
  level: number;
  mainWeapon: string | null;
  imageUrl: string | null;
  archived: boolean;
}

/** Errors the backend raises on purpose carry a message for the user; anything else gets a general one. */
function importErrorMessage(error: unknown): string {
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  const expected = ['functions/invalid-argument', 'functions/not-found', 'functions/failed-precondition'];
  return code && expected.includes(code) && message ? message : 'The character could not be imported. Try again.';
}

@Component({
  selector: 'app-character-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ImportCharacterDialogComponent, CharacterTileComponent],
  template: `
    @if (showImport()) {
      <app-import-character-dialog
        [busy]="importing()"
        [error]="importError()"
        (pdfSelected)="onImportPdf($event)"
        (linkSubmitted)="onImportLink($event)"
        (closed)="showImport.set(false)"
      />
    }

    <div class="max-w-6xl mx-auto sm:py-4">
      <header class="flex flex-wrap items-end justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <h1 class="qm-page-title">Your Characters</h1>
          <p class="qm-page-sub mt-1">Select a character to view or edit</p>
        </div>
        <div class="flex gap-2">
          <button type="button" class="qm-btn" [disabled]="creating()" (click)="openImport()">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" />
            </svg>
            Import
          </button>
          <button type="button" class="qm-btn qm-btn-gold" [disabled]="creating()" (click)="onCreateCharacter()">
            @if (creating()) {
              <span class="qm-spinner" aria-hidden="true"></span>
            } @else {
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
            }
            Create
          </button>
        </div>
      </header>

      @if (loading()) {
        <div class="flex items-center justify-center py-24" role="status" aria-label="Loading characters">
          <span class="qm-spinner qm-spinner-lg qm-spinner-light"></span>
        </div>
      } @else {
        @if (activeCharacters().length > 0) {
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-5">
            @for (char of activeCharacters(); track char.id) {
              <app-character-tile
                [name]="char.name"
                [subtitle]="char.race + ' ' + char.class"
                [imageUrl]="char.imageUrl"
                [level]="char.level"
                (opened)="onSelectCharacter(char.id)"
              />
            }
          </div>
        } @else {
          <div class="qm-panel qm-hero qm-empty max-w-xl mx-auto">
            <span class="qm-medallion qm-medallion-lg">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </span>
            @if (archivedCharacters().length > 0) {
              <h2 class="qm-empty-title">All your characters are archived</h2>
              <p class="qm-empty-text">Create a new one, or bring one back from the archive below.</p>
            } @else {
              <h2 class="qm-empty-title">No characters yet</h2>
              <p class="qm-empty-text">Create your first character to get started!</p>
            }
            <button type="button" class="qm-btn qm-btn-primary qm-btn-lg mt-6" (click)="onCreateCharacter()">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              Create Character
            </button>
            <button type="button" class="qm-link mt-4 text-sm" (click)="openImport()">
              Or import one from a PDF or a link
            </button>
          </div>
        }

        <!-- Archive: out of the way, one click to look into -->
        @if (archivedCharacters().length > 0) {
          <section class="mt-10">
            <button
              type="button"
              class="archive-toggle"
              [attr.aria-expanded]="showArchived()"
              aria-controls="archived-characters"
              (click)="showArchived.set(!showArchived())"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
              Archived ({{ archivedCharacters().length }})
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 transition-transform" [class.rotate-180]="showArchived()" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" /></svg>
            </button>
            @if (showArchived()) {
              <div id="archived-characters" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-5 mt-4">
                @for (char of archivedCharacters(); track char.id) {
                  <app-character-tile
                    [name]="char.name"
                    [subtitle]="char.race + ' ' + char.class"
                    [imageUrl]="char.imageUrl"
                    [level]="char.level"
                    [archived]="true"
                    (opened)="onSelectCharacter(char.id)"
                    (restored)="onUnarchive(char.id)"
                  />
                }
              </div>
            }
          </section>
        }
      }
    </div>
  `,
  styles: [`
    /* A quiet heading on the gradient that opens the archive. */
    .archive-toggle {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      min-height: 40px;
      font-family: var(--font-display);
      font-size: 0.76rem;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #fff;
      text-shadow: 0 1px 6px rgba(34, 16, 80, 0.4);
    }
    .archive-toggle:hover { text-decoration: underline; text-underline-offset: 4px; }
  `]
})
export class CharacterListPageComponent {
  private readonly router = inject(Router);
  private readonly characterService = inject(CharacterService);
  private readonly characterVersionService = inject(CharacterVersionService);
  private readonly characterImageService = inject(CharacterImageService);
  private readonly characterImportService = inject(CharacterImportService);
  private readonly toastService = inject(ToastService);

  loading = signal(true);
  creating = signal(false);
  characterSummaries = signal<CharacterSummary[]>([]);
  activeCharacters = computed(() => this.characterSummaries().filter(char => !char.archived));
  archivedCharacters = computed(() => this.characterSummaries().filter(char => char.archived));
  showArchived = signal(false);
  showImport = signal(false);
  importing = signal(false);
  importError = signal('');

  constructor() {
    this.loadCharacters();
  }

  onSelectCharacter(id: string): void {
    this.router.navigate(['/characters', id]);
  }

  async onCreateCharacter(): Promise<void> {
    this.creating.set(true);
    try {
      const id = await this.createBlankCharacter();
      this.router.navigate(['/characters', id]);
    } finally {
      this.creating.set(false);
    }
  }

  async onUnarchive(id: string): Promise<void> {
    try {
      await this.characterService.setArchived(id, false);
      this.characterSummaries.update(list => list.map(char => (char.id === id ? { ...char, archived: false } : char)));
    } catch (e) {
      logger.error('Failed to unarchive character:', e);
      this.toastService.show('Terugzetten is mislukt. Probeer het opnieuw.', 'error');
    }
  }

  openImport(): void {
    this.importError.set('');
    this.showImport.set(true);
  }

  /** A PDF goes to the chat of a new character, which reads it in. */
  async onImportPdf(file: File): Promise<void> {
    this.importError.set('');
    this.importing.set(true);
    try {
      const attachment = await readPdfAttachment(file);
      const id = await this.createBlankCharacter();
      this.characterImportService.queuePdf(id, attachment);
      this.router.navigate(['/characters', id]);
    } catch (e) {
      this.importError.set(e instanceof Error && e.message ? e.message : 'The PDF could not be imported. Try again.');
    } finally {
      this.importing.set(false);
    }
  }

  /** A share link is copied by the backend, which can also read other environments. */
  async onImportLink(link: string): Promise<void> {
    this.importError.set('');
    this.importing.set(true);
    try {
      const id = await this.characterImportService.importFromLink(link);
      this.router.navigate(['/characters', id]);
    } catch (e) {
      logger.error('Failed to import character from link:', e);
      this.importError.set(importErrorMessage(e));
    } finally {
      this.importing.set(false);
    }
  }

  private async createBlankCharacter(): Promise<string> {
    const chars = this.characterSummaries();
    const name = `New Character ${chars.length + 1}`;
    const initialData: DndCharacter = {
      name,
      class: 'Fighter',
      level: 1,
      race: 'Human',
      experiencePoints: 0,
      abilities: {
        strength: { score: 10, modifier: 0 },
        dexterity: { score: 10, modifier: 0 },
        constitution: { score: 10, modifier: 0 },
        intelligence: { score: 10, modifier: 0 },
        wisdom: { score: 10, modifier: 0 },
        charisma: { score: 10, modifier: 0 },
      },
      skills: [],
      savingThrows: {
        strength: { proficient: false, modifier: 0 },
        dexterity: { proficient: false, modifier: 0 },
        constitution: { proficient: false, modifier: 0 },
        intelligence: { proficient: false, modifier: 0 },
        wisdom: { proficient: false, modifier: 0 },
        charisma: { proficient: false, modifier: 0 },
      },
      passiveWisdom: 10,
      proficiencies: [],
      languages: ['Common'],
      armorClass: 10,
      initiative: 0,
      speed: 30,
      hitPoints: { max: 10, current: 10, temp: 0 },
      hitDice: { total: 1, current: 1, die: 'd10' },
      deathSaves: { successes: 0, failures: 0 },
      attacks: [],
      equipment: [],
      coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      featuresAndTraits: [],
    };

    return this.characterService.createCharacter(name, initialData);
  }

  private async loadCharacters(): Promise<void> {
    this.loading.set(true);
    try {
      const characters = await this.characterService.getCharacters();
      const summaries = await Promise.all(
        characters.map(char => this.buildSummary(char))
      );
      this.characterSummaries.set(summaries);
    } finally {
      this.loading.set(false);
    }
  }

  private async buildSummary(character: Character): Promise<CharacterSummary> {
    let dndData: DndCharacter | null = null;
    let imageUrl: string | null = null;

    try {
      const version = await this.characterVersionService.getVersion(
        character.id,
        character.activeVersionId
      );
      dndData = version?.character ?? null;
    } catch {
      // Fall back to metadata-only summary
    }

    try {
      const images = await this.characterImageService.getImages(character.id);
      imageUrl = images[0]?.url ?? null;
    } catch {
      // No image available
    }

    return {
      id: character.id,
      name: dndData?.name ?? character.name,
      class: dndData?.class ?? 'Unknown',
      race: dndData?.race ?? 'Unknown',
      level: dndData?.level ?? 1,
      mainWeapon: dndData?.attacks?.[0]?.name ?? null,
      imageUrl,
      archived: character.archived === true,
    };
  }
}
