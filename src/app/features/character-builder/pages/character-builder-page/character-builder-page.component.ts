import { Component, inject, signal, computed, effect, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { CharacterService } from '../../../../core/services/character.service';
import { CharacterVersionService } from '../../../../core/services/character-version.service';
import { ChatService } from '../../../../chat/chat.service';
import { Character, CharacterVersion } from '../../../../core/models/schemas/character.schema';
import { CharacterSheetComponent } from '../../components/character-sheet/character-sheet.component';
import { ChatComponent } from '../../../../chat/chat.component';
import { CharacterDraftPreviewComponent } from '../../components/character-draft-preview/character-draft-preview.component';
import { CharacterVersionHistoryComponent } from '../../components/character-version-history/character-version-history.component';

@Component({
  selector: 'app-character-builder-page',
  standalone: true,
  host: {
    '(window:keydown)': 'onWindowKeydown($event)'
  },
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    CharacterSheetComponent,
    ChatComponent,
    CharacterDraftPreviewComponent,
    CharacterVersionHistoryComponent
  ],
  template: `
    <div class="flex h-screen bg-base-200 overflow-hidden">
      <!-- Center Character Sheet -->
      <div class="flex-1 overflow-y-auto p-4">
        <div class="flex min-h-full flex-col gap-4">
          <div class="flex-1">
            @if (selectedCharacterId()) {
              @if (activeVersion()) {
                <mat-card class="bg-base-100 shadow-xl border border-base-300">
                  <mat-card-content class="p-6">
                    <app-character-sheet
                      [character]="displayCharacter() || activeVersion()!.character"
                      [characterName]="selectedCharacter()?.name || 'Unknown'"
                      (viewHistory)="showHistory.set(true)"
                    ></app-character-sheet>
                  </mat-card-content>
                </mat-card>
              } @else {
                <mat-card class="bg-base-100 shadow-lg border border-base-300">
                  <mat-card-content class="flex items-center justify-center min-h-[320px]">
                    <span class="loading loading-spinner loading-lg"></span>
                  </mat-card-content>
                </mat-card>
              }
            } @else {
              <mat-card class="bg-base-100 shadow-lg border border-base-300">
                <mat-card-content class="flex flex-col items-center justify-center min-h-[320px] text-base-content/60">
                  <h2 class="text-2xl font-bold mb-2">Select a Character</h2>
                  <p>Choose a character from the list or create a new one.</p>
                </mat-card-content>
              </mat-card>
            }
          </div>

          @if (draftCharacter()) {
            <div class="sticky bottom-4 z-10">
              <app-character-draft-preview
                (commit)="commitDraft()"
                (dismiss)="dismissDraft()"
              ></app-character-draft-preview>
            </div>
          }
        </div>
      </div>

      <!-- Right Chat Panel -->
      <div class="w-96 flex-shrink-0 bg-base-200 p-4">
        <mat-card class="h-full bg-base-100 shadow-xl border border-base-300">
          <mat-card-content class="p-4 h-full">
            @if (activeVersion()) {
              <app-chat #chat [character]="activeVersion()!.character"></app-chat>
            } @else {
              <div class="flex h-full items-center justify-center opacity-60 text-sm">
                Select a character to chat
              </div>
            }
          </mat-card-content>
        </mat-card>
      </div>
    </div>

    @if (showHistory() && selectedCharacterId()) {
      <app-character-version-history
        [versions]="versions()"
        [activeVersionId]="activeVersion()?.id || ''"
        (close)="showHistory.set(false)"
        (restore)="restoreVersion($event)"
      ></app-character-version-history>
    }
  `
})
export class CharacterBuilderPageComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private characterService = inject(CharacterService);
  private characterVersionService = inject(CharacterVersionService);
  private chatService = inject(ChatService);

  // State
  characters = signal<Character[]>([]);
  selectedCharacterId = signal<string | null>(null);
  
  selectedCharacter = computed(() => 
    this.characters().find(c => c.id === this.selectedCharacterId())
  );

  activeVersion = signal<CharacterVersion | null>(null);
  draftCharacter = this.chatService.getDraftCharacter();
  
  showHistory = signal(false);
  versions = signal<CharacterVersion[]>([]);
  chat = viewChild(ChatComponent);

  // Computed character to display (draft or active)
  displayCharacter = computed(() => {
    const draft = this.draftCharacter();
    if (draft) return draft;
    return this.activeVersion()?.character;
  });

  constructor() {
    // Load characters
    this.loadCharacters();

    // Handle route params
    this.route.paramMap.subscribe(params => {
      const id = params.get('characterId');
      if (id) {
        this.selectedCharacterId.set(id);
        this.loadActiveVersion(id);
      } else {
        this.selectedCharacterId.set(null);
        this.activeVersion.set(null);
      }
    });
    
    // Load versions when history is opened or character changes
    effect(async () => {
        if (this.showHistory() && this.selectedCharacterId()) {
            const history = await this.characterVersionService.getVersions(this.selectedCharacterId()!);
            this.versions.set(history);
        }
    });
  }

  async loadCharacters() {
    const chars = await this.characterService.getCharacters();
    this.characters.set(chars);
  }

  async loadActiveVersion(characterId: string) {
    this.activeVersion.set(null);
    const character = this.characters().find(c => c.id === characterId);
    if (character) {
      const version = await this.characterVersionService.getVersion(characterId, character.activeVersionId);
      this.activeVersion.set(version);
    } else {
      const fetchedChar = await this.characterService.getCharacter(characterId);
      if (fetchedChar) {
        const version = await this.characterVersionService.getVersion(characterId, fetchedChar.activeVersionId);
        this.activeVersion.set(version);
      }
    }
  }

  onSelectCharacter(id: string) {
    this.router.navigate(['/characters', id]);
  }

  async onCreateCharacter() {
    const name = `New Character ${this.characters().length + 1}`;
    const initialData: any = {
      name,
      class: 'Fighter',
      level: 1,
      race: 'Human',
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
      featuresAndTraits: []
    };

    const id = await this.characterService.createCharacter(name, initialData);
    await this.loadCharacters();
    this.onSelectCharacter(id);
  }

  async commitDraft() {
    const draft = this.draftCharacter();
    const charId = this.selectedCharacterId();
    if (!draft || !charId) return;

    // Create new version
    await this.characterVersionService.createVersion(
      charId,
      draft,
      'Updated via Sidekick',
      'ai'
    );

    // Reload to get new active version
    await this.loadCharacters();
    await this.loadActiveVersion(charId);
    
    // Clear draft
    this.chatService.clearDraft();
  }

  dismissDraft() {
    this.chatService.clearDraft();
  }

  async restoreVersion(version: CharacterVersion) {
    const charId = this.selectedCharacterId();
    if (!charId) return;

    await this.characterVersionService.restoreVersion(charId, version);
    
    // Reload
    await this.loadCharacters();
    await this.loadActiveVersion(charId);
    this.showHistory.set(false);
  }

  onWindowKeydown(event: KeyboardEvent): void {
    if (!this.activeVersion() || event.defaultPrevented) {
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (this.isEditableTarget(target)) {
      return;
    }

    const key = event.key;
    if (key.length !== 1) {
      return;
    }

    const chat = this.chat();
    if (!chat) {
      return;
    }

    event.preventDefault();
    chat.focusInput();
    chat.appendToMessage(key);
  }

  private isEditableTarget(target: HTMLElement | null): boolean {
    if (!target) {
      return false;
    }
    const tagName = target.tagName?.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
      return true;
    }
    return target.isContentEditable === true;
  }
}
