import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { CharacterService } from '../../../../core/services/character.service';
import { CharacterVersionService } from '../../../../core/services/character-version.service';
import { CharacterImageService } from '../../../../core/services/character-image.service';
import { Character } from '../../../../core/models/schemas/character.schema';
import { DndCharacter } from '../../../../shared/models/dnd-character.model';

interface CharacterSummary {
  id: string;
  name: string;
  class: string;
  race: string;
  level: number;
  mainWeapon: string | null;
  imageUrl: string | null;
}

@Component({
  selector: 'app-character-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  template: `
    <div class="min-h-full bg-base-200 p-8">
      <div class="max-w-6xl mx-auto">
        <!-- Header -->
        <div class="flex justify-between items-center mb-8">
          <div>
            <h1 class="text-3xl font-bold font-serif">Your Characters</h1>
            <p class="text-base-content/60 mt-1">Select a character to view or edit</p>
          </div>
          <button
            (click)="onCreateCharacter()"
            [disabled]="creating()"
            class="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-gray-700 font-medium text-sm rounded-full shadow-sm border border-gray-200 hover:bg-gray-50 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            @if (creating()) {
              <span class="loading loading-spinner loading-sm"></span>
            } @else {
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
            }
            Create
          </button>
        </div>

        <!-- Loading -->
        @if (loading()) {
          <div class="flex items-center justify-center py-24">
            <span class="loading loading-spinner loading-lg"></span>
          </div>
        } @else {
          <!-- Character Grid -->
          @if (characterSummaries().length > 0) {
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              @for (char of characterSummaries(); track char.id) {
                <div
                  class="border border-white/20 aspect-square rounded-2xl overflow-hidden cursor-pointer shadow-md hover:shadow-xl transition-all duration-200 hover:-translate-y-1 hover:scale-[1.02] relative group"
                  (click)="onSelectCharacter(char.id)"
                >
                  @if (char.imageUrl) {
                    <!-- Tile with image -->
                    <img
                      [src]="char.imageUrl"
                      [alt]="char.name"
                      class="absolute inset-0 w-full h-full object-cover"
                    />
                    <div class="absolute inset-0 bg-white/20"></div>
                  } @else {
                    <!-- Glassy tile without image -->
                    <div class="absolute inset-0 bg-base-300/40 backdrop-blur-md border border-white/20"></div>
                    <div class="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"></div>
                  }

                  <!-- Bottom 1/3 overlay for contrast -->
                  <div class="absolute bottom-0 left-0 right-0 h-1/3 bg-black/40 backdrop-blur-[2px]"></div>

                  <!-- Content overlay — pinned to bottom -->
                  <div class="absolute bottom-0 left-0 right-0 px-2.5 pb-2">
                    <p class="text-[12px] font-medium leading-none !mb-2 text-white/80 drop-shadow-sm">{{ char.name }}</p>
                    <p class="text-[10px] leading-none !mb-2 text-white/50">{{ char.race }} {{ char.class }}</p>
                  </div>
                </div>
              }
            </div>
          } @else {
            <!-- Empty State -->
            <div class="flex flex-col items-center justify-center py-24 text-base-content/50">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <h2 class="text-xl font-bold mb-2">No characters yet</h2>
              <p class="mb-6">Create your first character to get started!</p>
              <button
                (click)="onCreateCharacter()"
                class="inline-flex items-center gap-2 px-6 py-3 bg-white text-gray-700 font-medium text-sm rounded-full shadow-sm border border-gray-200 hover:bg-gray-50 hover:shadow-md transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                Create Character
              </button>
            </div>
          }
        }
      </div>
    </div>
  `
})
export class CharacterListPageComponent {
  private readonly router = inject(Router);
  private readonly characterService = inject(CharacterService);
  private readonly characterVersionService = inject(CharacterVersionService);
  private readonly characterImageService = inject(CharacterImageService);

  loading = signal(true);
  creating = signal(false);
  characterSummaries = signal<CharacterSummary[]>([]);

  constructor() {
    this.loadCharacters();
  }

  onSelectCharacter(id: string): void {
    this.router.navigate(['/characters', id]);
  }

  async onCreateCharacter(): Promise<void> {
    this.creating.set(true);
    try {
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

      const id = await this.characterService.createCharacter(name, initialData);
      this.router.navigate(['/characters', id]);
    } finally {
      this.creating.set(false);
    }
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
    };
  }
}
