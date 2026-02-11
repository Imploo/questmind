import { Component, inject, signal, computed, effect, viewChild, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { CharacterService } from '../../../../core/services/character.service';
import { CharacterVersionService } from '../../../../core/services/character-version.service';
import { ChatService } from '../../../../chat/chat.service';
import { Character, CharacterVersion } from '../../../../core/models/schemas/character.schema';
import { DndCharacter } from '../../../../shared/schemas/dnd-character.schema';
import { CharacterSheetComponent } from '../../components/character-sheet/character-sheet.component';
import { ChatComponent } from '../../../../chat/chat.component';
import { CharacterDraftPreviewComponent } from '../../components/character-draft-preview/character-draft-preview.component';
import { CharacterVersionHistoryComponent } from '../../components/character-version-history/character-version-history.component';
import { ChatDrawerComponent } from '../../components/chat-drawer/chat-drawer.component';

@Component({
  selector: 'app-character-builder-page',
  standalone: true,
  host: {
    '(window:keydown)': 'onWindowKeydown($event)',
    '(window:resize)': 'onWindowResize()'
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    CharacterSheetComponent,
    ChatComponent,
    CharacterDraftPreviewComponent,
    CharacterVersionHistoryComponent,
    ChatDrawerComponent,
  ],
  template: `
    <div class="flex min-h-screen bg-base-200">
      @if (isNarrow()) {
        <div class="relative w-full">
          @if (draftCharacter()) {
            <div class="sticky -top-2 z-20 bg-base-200 pb-4">
              <app-character-draft-preview
                [loading]="isCommitting()"
                (commit)="commitDraft()"
                (dismiss)="dismissDraft()"
              ></app-character-draft-preview>
            </div>
          }
          <div class="flex flex-col gap-4" style="padding-bottom: calc(10vh + 1rem)">
            @if (selectedCharacterId()) {
              @if (activeVersion()) {
                <mat-card class="bg-base-100 shadow-xl border border-base-300">
                  <mat-card-content>
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

          <app-chat-drawer
            #chatDrawer
            [character]="activeVersion()?.character ?? null"
          ></app-chat-drawer>
        </div>
      } @else {
        <div class="flex w-full items-start">
          <!-- Center Character Sheet -->
          <div class="w-2/3 p-4">
            <div class="flex flex-col gap-4">
              @if (draftCharacter()) {
                <div class="sticky top-8 z-10">
                  <app-character-draft-preview
                      [loading]="isCommitting()"
                      (commit)="commitDraft()"
                      (dismiss)="dismissDraft()"
                  ></app-character-draft-preview>
                </div>
              }
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
            </div>
          </div>

          <!-- Right Chat Panel -->
          <div class="w-1/3 bg-base-200 p-4 sticky top-4 h-[calc(100vh-2rem)]">
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
      }
    </div>

    @if (showHistory() && selectedCharacterId()) {
      <app-character-version-history
        [versions]="versions()"
        [activeVersionId]="activeVersion()?.id || ''"
        (closed)="showHistory.set(false)"
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
  chatDrawer = viewChild<ChatDrawerComponent>('chatDrawer');
  isNarrow = signal<boolean>(false);
  isCommitting = signal<boolean>(false);

  // Computed character to display (draft or active)
  displayCharacter = computed(() => {
    const draft = this.draftCharacter();
    if (draft) return draft;
    return this.activeVersion()?.character;
  });

  constructor() {
    this.updateLayoutWidth();
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

    // Update chat service with character ID
    effect(() => {
      const character = this.selectedCharacter();
      if (character) {
        this.chatService.setCharacterId(character.id);
      } else {
        this.chatService.setCharacterId(null);
      }
    });
  }

  onWindowResize(): void {
    this.updateLayoutWidth();
  }

  async loadCharacters() {
    const chars = await this.characterService.getCharacters();
    this.characters.set(chars);
  }

  async loadActiveVersion(characterId: string) {
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
    const initialData = {
      name,
      class: 'Fighter',
      level: 1,
      race: 'Human',
      experiencePoints: 0,
      images: [],
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

    const id = await this.characterService.createCharacter(name, initialData as DndCharacter);
    await this.loadCharacters();
    this.onSelectCharacter(id);
  }

  async commitDraft() {
    const draft = this.draftCharacter();
    const charId = this.selectedCharacterId();
    if (!draft || !charId) return;

    this.isCommitting.set(true);

    try {
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
    } finally {
      this.isCommitting.set(false);
    }
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

    if (this.isNarrow()) {
      const drawer = this.chatDrawer();
      if (drawer) {
        drawer.expand();
        drawer.focusChat();
      }
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

  private updateLayoutWidth(): void {
    if (typeof window === 'undefined') {
      this.isNarrow.set(false);
      return;
    }
    this.isNarrow.set(window.innerWidth < 1024);
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
