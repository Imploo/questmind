import { Component, inject, signal, computed, effect, linkedSignal, viewChild, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../../auth/auth.service';
import { CharacterService } from '../../../../core/services/character.service';
import { CharacterVersionService } from '../../../../core/services/character-version.service';
import { CharacterImageService } from '../../../../core/services/character-image.service';
import { ChatService } from '../../../../chat/chat.service';
import { CharacterSheetExportService } from '../../services/character-sheet-export.service';
import { CharacterImportService } from '../../services/character-import.service';
import * as logger from '../../../../shared/logger';
import { Character, CharacterVersion } from '../../../../core/models/schemas/character.schema';
import { CharacterImage } from '../../../../core/models/schemas/character-image.schema';
import { Coins, DndCharacter } from '../../../../shared/models/dnd-character.model';
import { CharacterPlayState } from '../../../../shared/models/character-play-state.model';
import { applyPlayStateToCharacter, resolvePlayState } from '../../../../shared/utils/character-play-state';
import { CharacterSheetComponent, SpellResolvedEvent, FeatureResolvedEvent, UsesChangeEvent } from '../../components/character-sheet/character-sheet.component';
import { ChatComponent } from '../../../../chat/chat.component';
import { CharacterDraftPreviewComponent } from '../../components/character-draft-preview/character-draft-preview.component';
import { CharacterVersionHistoryComponent } from '../../components/character-version-history/character-version-history.component';
import { ChatDrawerComponent } from '../../components/chat-drawer/chat-drawer.component';

@Component({
  selector: 'app-character-builder-page',
  host: {
    '(window:keydown)': 'onWindowKeydown($event)',
    '(window:resize)': 'onWindowResize()'
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatProgressSpinnerModule,
    CharacterSheetComponent,
    ChatComponent,
    CharacterDraftPreviewComponent,
    CharacterVersionHistoryComponent,
    ChatDrawerComponent,
  ],
  template: `
    <div class="flex min-h-screen bg-[#f4eee2]">
        <div class="flex w-full items-start">
          <!-- Center Character Sheet -->
          <div
              class="max-w-5xl mx-auto"
              [class]="isNarrow() || !isOwner() ? 'w-full' : 'w-2/3 p-4'"
          >
            <div class="flex flex-col gap-4">
              @if (isDraft()) {
                <div class="sticky top-8 z-10">
                  <app-character-draft-preview
                      [loading]="isCommitting()"
                      [abilityScoreWarnings]="latestVersion()?.abilityScoreWarnings ?? []"
                      [derivedStatCorrections]="latestVersion()?.derivedStatCorrections ?? []"
                      (commit)="commitDraft()"
                      (dismiss)="dismissDraft()"
                  ></app-character-draft-preview>
                </div>
              }
              <div class="flex-1">
                @if (selectedCharacterId()) {
                  @if (latestVersion()) {
                    <div class="relative p-3 sm:p-6">
                      @if (isGenerating()) {
                        <div class="absolute inset-0 z-10 flex items-center justify-center bg-[#f4eee2]/70 rounded-2xl">
                          <mat-spinner diameter="30"></mat-spinner>
                        </div>
                      }
                      <div>
                        <app-character-sheet
                          [character]="latestVersion()!.character"
                          [characterName]="selectedCharacter()?.name || 'Unknown'"
                          [characterId]="selectedCharacterId()"
                          [activeVersionId]="latestVersion()?.id ?? ''"
                          [images]="characterImages()"
                          [canDelete]="isOwner()"
                          [exportingPdf]="exportingPdf()"
                          [playState]="playState()"
                          [editable]="isOwner()"
                          (playStateChange)="onPlayStateChange($event)"
                          (usesChange)="onUsesChange($event)"
                          (coinsChange)="onCoinsChange($event)"
                          (exportPdf)="onExportPdf()"
                          (viewHistory)="showHistory.set(true)"
                          (deleteImage)="onDeleteImage($event)"
                          (spellResolved)="onSpellResolved($event)"
                          (featureResolved)="onFeatureResolved($event)"
                        ></app-character-sheet>
                      </div>
                    </div>
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

          <!-- Chat Panel (owner only) -->
          @if (isOwner()) {
            @if (isNarrow()) {
              <app-chat-drawer
                  #chatDrawer
                  [character]="liveCharacter()"
              ></app-chat-drawer>
            } @else {
              <div class="w-1/3 p-4 sticky top-4 h-[calc(100vh-2rem)]">
                <mat-card class="h-full bg-base-100 shadow-xl border border-base-300">
                  <mat-card-content class="p-4 h-full">
                    @if (latestVersion()) {
                      <app-chat #chat [character]="liveCharacter()!"></app-chat>
                    } @else {
                      <div class="flex h-full items-center justify-center opacity-60 text-sm">
                        Select a character to chat
                      </div>
                    }
                  </mat-card-content>
                </mat-card>
              </div>
            }
          }
        </div>
    </div>

    @if (isOwner() && showHistory() && selectedCharacterId()) {
      <app-character-version-history
        [versions]="versions()"
        [activeVersionId]="latestVersion()?.id || ''"
        (closed)="showHistory.set(false)"
        (restore)="restoreVersion($event)"
      ></app-character-version-history>
    }
  `
})
export class CharacterBuilderPageComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private characterService = inject(CharacterService);
  private characterVersionService = inject(CharacterVersionService);
  private characterImageService = inject(CharacterImageService);
  private chatService = inject(ChatService);
  private characterSheetExportService = inject(CharacterSheetExportService);
  private characterImportService = inject(CharacterImportService);
  private destroyRef = inject(DestroyRef);

  // State
  characters = signal<Character[]>([]);
  selectedCharacterId = signal<string | null>(null);
  characterImages = this.characterImageService.images;

  selectedCharacter = computed(() =>
    this.characters().find(c => c.id === this.selectedCharacterId())
  );

  // True when the current user is the owner of the loaded character
  isOwner = computed(() => {
    const user = this.authService.currentUser();
    const character = this.selectedCharacter();
    if (!user || !character) return false;
    return user.uid === character.userId;
  });

  // Latest version from Firestore real-time listener
  latestVersion = this.characterVersionService.latestVersion;

  /**
   * Live table state of the selected character. Set locally first so the sheet reacts at
   * once, and reset whenever the stored character changes.
   */
  playState = linkedSignal<CharacterPlayState | null>(() => this.selectedCharacter()?.playState ?? null);

  /** The latest version with the live hit points, hit dice and slots, for the AI chat. */
  liveCharacter = computed(() => {
    const version = this.latestVersion();
    return version ? applyPlayStateToCharacter(version.character, this.playState()) : null;
  });

  // Draft detection: true when the latest version is a draft
  isDraft = computed(() => this.latestVersion()?.isDraft === true);

  showHistory = signal(false);
  exportingPdf = signal(false);
  versions = signal<CharacterVersion[]>([]);
  chat = viewChild(ChatComponent);
  chatDrawer = viewChild<ChatDrawerComponent>('chatDrawer');
  isNarrow = signal<boolean>(false);
  isCommitting = signal<boolean>(false);

  isGenerating = computed(() => this.selectedCharacter()?.isGenerating === true);

  constructor() {
    this.updateLayoutWidth();
    // Load characters
    this.loadCharacters();

    // Handle route params
    this.route.paramMap.subscribe(params => {
      const id = params.get('characterId');

      if (id) {
        this.selectedCharacterId.set(id);
        this.characterService.activeCharacterId.set(id);
        this.characterVersionService.activeCharacterId.set(id);
        this.characterImageService.activeCharacterId.set(id);
        this.loadCharacterData(id);
      } else {
        this.selectedCharacterId.set(null);
        this.characterService.activeCharacterId.set(null);
        this.characterVersionService.activeCharacterId.set(null);
        this.characterImageService.activeCharacterId.set(null);
      }
    });

    // Sync real-time character updates (e.g. isGenerating flag) to local list
    effect(() => {
      const character = this.characterService.activeCharacter();
      if (character) {
        this.characters.update(list =>
          list.map(c => c.id === character.id ? character : c)
        );
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

    // A PDF picked in the import dialog of the character list: hand it to the chat of
    // the freshly created character as soon as that chat is on screen.
    effect(() => {
      const characterId = this.selectedCharacterId();
      const chat = this.isNarrow() ? this.chatDrawer() : this.chat();
      if (!characterId || !chat || !this.isOwner() || !this.latestVersion()) return;
      // Wait a tick, so the chat has been told which character it is talking about.
      setTimeout(() => this.sendPendingPdf(characterId));
    });

    // Clean up service state on destroy
    this.destroyRef.onDestroy(() => {
      this.characterService.activeCharacterId.set(null);
      this.characterVersionService.activeCharacterId.set(null);
      this.characterImageService.activeCharacterId.set(null);
    });
  }

  onWindowResize(): void {
    this.updateLayoutWidth();
  }

  private sendPendingPdf(characterId: string): void {
    const chat = this.isNarrow() ? this.chatDrawer() : this.chat();
    if (!chat || this.selectedCharacterId() !== characterId) return;
    const pdf = this.characterImportService.takePdf(characterId);
    // The drawer reports false while its chat is not rendered yet: keep the PDF for the next try.
    if (pdf && chat.sendAttachment(pdf) === false) {
      this.characterImportService.queuePdf(characterId, pdf);
    }
  }

  async loadCharacters() {
    const chars = await this.characterService.getCharacters();
    // Merge: keep any publicly-loaded characters not returned by the user query
    // (handles the race where loadCharacterData runs before auth resolves)
    this.characters.update(existing => {
      const newIds = new Set(chars.map(c => c.id));
      const preserved = existing.filter(c => !newIds.has(c.id));
      return [...chars, ...preserved];
    });
  }

  private async loadCharacterData(characterId: string) {
    let character = this.characters().find(c => c.id === characterId);
    if (!character) {
      const fetched = await this.characterService.getCharacter(characterId);
      if (fetched) {
        character = fetched;
        this.characters.update(list => [...list, fetched]);
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
    const version = this.latestVersion();
    const charId = this.selectedCharacterId();
    if (!version?.isDraft || !charId) return;

    this.isCommitting.set(true);

    try {
      await this.characterVersionService.commitDraft(charId, version.id);
      await this.loadCharacters();
    } finally {
      this.isCommitting.set(false);
    }
  }

  async dismissDraft() {
    const version = this.latestVersion();
    const charId = this.selectedCharacterId();
    if (!version?.isDraft || !charId) return;

    await this.characterVersionService.dismissDraft(charId, version.id);
  }

  async restoreVersion(version: CharacterVersion) {
    const charId = this.selectedCharacterId();
    if (!charId) return;

    await this.characterVersionService.restoreVersion(charId, version);

    // Reload character list to update activeVersionId
    await this.loadCharacters();
    this.showHistory.set(false);
  }

  onWindowKeydown(event: KeyboardEvent): void {
    if (!this.isOwner() || !this.latestVersion() || event.defaultPrevented) {
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

  /**
   * The PDF is the sheet as built: it leaves the live play state (hit points, spent
   * slots, ...) out, except for the items the player keeps by hand.
   */
  async onExportPdf(): Promise<void> {
    const version = this.latestVersion();
    if (!version || this.exportingPdf()) return;
    this.exportingPdf.set(true);
    try {
      await this.characterSheetExportService.export({
        character: version.character,
        inventory: resolvePlayState(version.character, this.playState()).inventory,
        characterId: this.selectedCharacterId(),
        versionId: version.id ?? null,
        canResolveRemotely: this.isOwner(),
      });
    } catch (e) {
      logger.error('Failed to export character sheet PDF:', e);
    } finally {
      this.exportingPdf.set(false);
    }
  }

  async onDeleteImage(image: CharacterImage): Promise<void> {
    await this.characterImageService.deleteImage(image);
  }

  async onSpellResolved(event: SpellResolvedEvent): Promise<void> {
    // Patch Firestore — the onSnapshot listener will pick up the change automatically
    const charId = this.selectedCharacterId();
    const versionId = this.latestVersion()?.id;
    if (charId && versionId) {
      await this.characterVersionService.patchSpellDetails(charId, versionId, event.spellName, event.description, event.usage);
    }
  }

  async onPlayStateChange(playState: CharacterPlayState): Promise<void> {
    const charId = this.selectedCharacterId();
    if (!charId || !this.isOwner()) return;
    this.playState.set(playState);
    try {
      await this.characterService.updatePlayState(charId, playState);
    } catch (e) {
      logger.error('Failed to store character play state:', e);
    }
  }

  async onUsesChange(event: UsesChangeEvent): Promise<void> {
    const charId = this.selectedCharacterId();
    const versionId = this.latestVersion()?.id;
    if (!charId || !versionId || !this.isOwner()) return;
    try {
      await this.characterVersionService.patchUses(charId, versionId, event.owner, event.name, event.uses);
    } catch (e) {
      logger.error('Failed to store uses tracker:', e);
    }
  }

  async onCoinsChange(coins: Coins): Promise<void> {
    const charId = this.selectedCharacterId();
    const versionId = this.latestVersion()?.id;
    if (!charId || !versionId || !this.isOwner()) return;
    try {
      await this.characterVersionService.patchCoins(charId, versionId, coins);
    } catch (e) {
      logger.error('Failed to store coins:', e);
    }
  }

  async onFeatureResolved(event: FeatureResolvedEvent): Promise<void> {
    const charId = this.selectedCharacterId();
    const versionId = this.latestVersion()?.id;
    if (charId && versionId) {
      await this.characterVersionService.patchFeatureDescription(charId, versionId, event.featureName, event.description);
    }
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
