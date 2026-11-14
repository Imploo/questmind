import { Component, inject, signal, computed, effect, linkedSignal, untracked, viewChild, ChangeDetectionStrategy, DestroyRef, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../../auth/auth.service';
import { CharacterService } from '../../../../core/services/character.service';
import { CharacterVersionService } from '../../../../core/services/character-version.service';
import { CharacterImageService } from '../../../../core/services/character-image.service';
import { ChatService } from '../../../../chat/chat.service';
import { CharacterSheetExportService } from '../../services/character-sheet-export.service';
import { CharacterImportService } from '../../services/character-import.service';
import { ToastService } from '../../../../shared/services/toast.service';
import * as logger from '../../../../shared/logger';
import { Character, CharacterVersion } from '../../../../core/models/schemas/character.schema';
import { CharacterImage, portraitUrlOf } from '../../../../core/models/schemas/character-image.schema';
import { Coins, DndCharacter } from '../../../../shared/models/dnd-character.model';
import { CharacterPlayState } from '../../../../shared/models/character-play-state.model';
import { applyPlayStateToCharacter, resolvePlayState } from '../../../../shared/utils/character-play-state';
import { CharacterSheetComponent, SpellResolvedEvent, FeatureResolvedEvent, UsesChangeEvent } from '../../components/character-sheet/character-sheet.component';
import { ChatComponent } from '../../../../chat/chat.component';
import { CharacterDraftPreviewComponent } from '../../components/character-draft-preview/character-draft-preview.component';
import { CharacterVersionHistoryComponent } from '../../components/character-version-history/character-version-history.component';
import { PanelSwitcherComponent } from '../../../../layout/panel-switcher/panel-switcher.component';
import { PagePanel, PanelSwitcherService } from '../../../../layout/panel-switcher/panel-switcher.service';
import { trackVisualViewport } from '../../../../shared/utils/visual-viewport';

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
    CharacterSheetComponent,
    ChatComponent,
    CharacterDraftPreviewComponent,
    CharacterVersionHistoryComponent,
    PanelSwitcherComponent,
  ],
  template: `
    <!--
      Wide, the chat stands beside the sheet. Narrow, each gets a panel as high as the
      screen and you swipe between the two, or tap a tab of the switcher in the top bar.
    -->
    <div class="page" [class.is-panels]="panelsMode()">
      @if (panelsMode()) {
        <!-- From 640px up there is no top bar: the page brings its own switcher. -->
        <div class="switcher-bar">
          <app-panel-switcher />
        </div>
      }
      <div class="page-panels" #panels>
      <!-- Character sheet -->
      <div class="sheet-panel" [attr.inert]="panelsMode() && activePanel() !== 'sheet' ? '' : null">
        <div class="sheet-column max-w-5xl mx-auto flex flex-col gap-4">
          <!-- Back to the character list. The list is behind sign-in, so a signed-out visitor gets no link. -->
          @if (isAuthenticated()) {
            <nav aria-label="Breadcrumb" class="-mb-1 flex">
              <a routerLink="/characters" class="qm-backlink">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Overzicht
              </a>
            </nav>
          }
          @if (isDraft()) {
            <div class="sticky z-10" [class]="panelsMode() ? 'top-0' : 'top-[4.25rem] sm:top-4'">
              <app-character-draft-preview
                  [loading]="isCommitting()"
                  [abilityScoreWarnings]="latestVersion()?.abilityScoreWarnings ?? []"
                  [derivedStatCorrections]="latestVersion()?.derivedStatCorrections ?? []"
                  (commit)="commitDraft()"
                  (dismiss)="dismissDraft()"
              ></app-character-draft-preview>
            </div>
          }
          @if (selectedCharacterId()) {
            @if (latestVersion()) {
              <div class="relative">
                @if (isGenerating()) {
                  <div class="absolute -inset-2 z-10 flex items-start justify-center rounded-2xl bg-[rgba(40,24,90,0.35)] pt-[30vh] backdrop-blur-[2px]" role="status" aria-label="Updating character">
                    <span class="qm-medallion qm-medallion-lg"><span class="qm-spinner qm-spinner-lg"></span></span>
                  </div>
                }
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
                  [canClone]="canClone()"
                  [cloning]="cloning()"
                  [archived]="selectedCharacter()?.archived === true"
                  (cloneCharacter)="onCloneCharacter()"
                  (archivedChange)="onArchivedChange($event)"
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
            } @else {
              <div class="qm-panel flex items-center justify-center min-h-[320px]" role="status" aria-label="Loading character">
                <span class="qm-spinner qm-spinner-lg"></span>
              </div>
            }
          } @else {
            <div class="qm-panel qm-hero qm-empty min-h-[320px] justify-center">
              <h2 class="qm-empty-title">Select a Character</h2>
              <p class="qm-empty-text">Choose a character from the list or create a new one.</p>
            </div>
          }
        </div>
      </div>

      <!-- Chat panel (owner only) -->
      @if (isOwner()) {
        <aside class="chat-panel" aria-label="Chat" [attr.inert]="panelsMode() && activePanel() !== 'chat' ? '' : null">
          <div class="chat-frame">
            @if (latestVersion()) {
              <app-chat [character]="liveCharacter()!" [floating]="panelsMode()" (viewVersions)="showHistory.set(true)"></app-chat>
            } @else {
              <div class="flex h-full items-center justify-center text-sm qm-muted">
                Select a character to chat
              </div>
            }
          </div>
        </aside>
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
  `,
  styles: [`
    :host { display: block; }

    .page-panels {
      display: flex;
      width: 100%;
      align-items: flex-start;
      gap: 1.5rem;
    }
    .sheet-panel { min-width: 0; flex: 1; }
    .chat-panel {
      position: sticky;
      top: 1.5rem;
      flex-shrink: 0;
      width: 33.333%;
      max-width: 26rem;
      height: calc(100dvh - 3rem);
    }
    .chat-frame {
      height: 100%;
      overflow: hidden;
      color: var(--ink);
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 14px;
      box-shadow: var(--panel-shadow);
    }

    /*
     * Two panels, each as high as what is left of the screen. The height follows the
     * visible part of the page, so an open keyboard shrinks the panels instead of
     * covering the composer. No transform or fixed position here: the dialogs of the
     * sheet have to keep stacking above the top bar.
     */
    .page.is-panels {
      position: relative;
      top: var(--vv-top, 0px);
      display: flex;
      flex-direction: column;
      height: calc(var(--vv-height, 100dvh) - 3.5rem);
    }
    .switcher-bar { display: none; }
    .is-panels .page-panels {
      flex: 1;
      min-height: 0;
      align-items: stretch;
      gap: 0;
      overflow-x: auto;
      overflow-y: hidden;
      overscroll-behavior-x: contain;
      scroll-snap-type: x mandatory;
      scrollbar-width: none;
    }
    .is-panels .page-panels::-webkit-scrollbar { display: none; }
    .is-panels .sheet-panel,
    .is-panels .chat-panel {
      position: static;
      flex: 0 0 100%;
      width: auto;
      max-width: none;
      height: auto;
      min-width: 0;
      scroll-snap-align: start;
      scroll-snap-stop: always;
    }
    .is-panels .sheet-panel {
      overflow-y: auto;
      overscroll-behavior-y: contain;
    }
    /* The room around the sheet scrolls along, so the draft banner can stick to the very top. */
    .is-panels .sheet-column {
      padding: 0.75rem 0.75rem calc(0.75rem + env(safe-area-inset-bottom, 0px));
    }
    .is-panels .chat-frame {
      border: 0;
      border-radius: 0;
      box-shadow: none;
    }

    @media (min-width: 640px) {
      .page.is-panels { height: var(--vv-height, 100dvh); }
      .is-panels .switcher-bar {
        display: flex;
        flex-shrink: 0;
        justify-content: center;
        padding: 6px 0.75rem;
        background: linear-gradient(90deg, rgba(36, 24, 92, 0.5), rgba(58, 28, 104, 0.56));
        border-bottom: 1px solid rgba(255, 255, 255, 0.16);
      }
      .is-panels .sheet-column { padding: 1.5rem; }
    }
  `]
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
  private toastService = inject(ToastService);
  private destroyRef = inject(DestroyRef);
  private panelSwitcher = inject(PanelSwitcherService);

  // State
  characters = signal<Character[]>([]);
  selectedCharacterId = signal<string | null>(null);
  characterImages = this.characterImageService.images;

  selectedCharacter = computed(() =>
    this.characters().find(c => c.id === this.selectedCharacterId())
  );

  isAuthenticated = this.authService.isAuthenticated;

  // True when the current user is the owner of the loaded character
  isOwner = computed(() => {
    const user = this.authService.currentUser();
    const character = this.selectedCharacter();
    if (!user || !character) return false;
    return user.uid === character.userId;
  });

  /** A signed-in visitor looking at someone else's character can copy it to their own account. */
  canClone = computed(() => {
    const user = this.authService.currentUser();
    const character = this.selectedCharacter();
    return !!user && !!character && user.uid !== character.userId;
  });
  cloning = signal(false);

  // Latest version from Firestore real-time listener
  latestVersion = this.characterVersionService.latestVersion;

  /**
   * Live table state of the selected character. Set locally first so the sheet reacts at
   * once, and reset whenever the stored character changes. It is the owner's alone: a
   * visitor sees the character as built, without hit points, spent slots or inventory.
   */
  playState = linkedSignal<CharacterPlayState | null>(() =>
    this.isOwner() ? this.selectedCharacter()?.playState ?? null : null
  );

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
  private panels = viewChild<ElementRef<HTMLElement>>('panels');
  isNarrow = signal<boolean>(false);
  /** Narrow and with a chat: the sheet and the chat are two panels you swipe between. */
  panelsMode = computed(() => this.isNarrow() && this.isOwner());
  activePanel = this.panelSwitcher.active;
  /** Someone started typing on the sheet: the chat takes the focus once it is on screen. */
  private focusChatOnArrival = false;
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
        // Also add it when it is new to the list: a character the backend just created
        // (an import or a clone) can arrive after the page already looked for it.
        this.characters.update(list =>
          list.some(c => c.id === character.id)
            ? list.map(c => c.id === character.id ? character : c)
            : [...list, character]
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

    // The chat and its stored conversations belong to the owner; a visitor gets none.
    effect(() => {
      const character = this.selectedCharacter();
      this.chatService.setCharacterId(character && this.isOwner() ? character.id : null);
    });

    // A PDF picked in the import dialog of the character list: hand it to the chat of
    // the freshly created character as soon as that chat is on screen.
    effect(() => {
      const characterId = this.selectedCharacterId();
      const chat = this.chat();
      if (!characterId || !chat || !this.isOwner() || !this.latestVersion()) return;
      // Wait a tick, so the chat has been told which character it is talking about.
      setTimeout(() => this.sendPendingPdf(characterId));
    });

    // The panels: report the swipe to the switcher, follow its tabs, and size with the
    // visible part of the page so the keyboard does not cover the chat.
    effect(onCleanup => {
      const panels = this.panels()?.nativeElement;
      if (!this.panelsMode() || !panels) return;

      this.panelSwitcher.enabled.set(true);
      const stopViewport = trackVisualViewport();
      const onScroll = () =>
        this.panelSwitcher.setProgress(panels.clientWidth ? panels.scrollLeft / panels.clientWidth : 0);
      panels.addEventListener('scroll', onScroll, { passive: true });
      const requests = this.panelSwitcher.requested.subscribe(panel => this.showPanel(panel));

      onCleanup(() => {
        requests.unsubscribe();
        panels.removeEventListener('scroll', onScroll);
        stopViewport();
        this.panelSwitcher.reset();
      });
    });

    // Leaving the chat puts the keyboard away with it; arriving there by typing takes the focus.
    effect(() => {
      const panel = this.activePanel();
      if (!untracked(() => this.panelsMode())) return;
      if (panel === 'sheet') {
        const focused = document.activeElement;
        if (focused instanceof HTMLElement && focused.closest('.chat-panel')) {
          focused.blur();
        }
      } else if (this.focusChatOnArrival) {
        this.focusChatOnArrival = false;
        // After the render: until then the chat panel is still inert and refuses the focus.
        setTimeout(() => this.chat()?.focusInput());
      }
    });

    // An answer that comes in while the sheet is on screen lights the dot on the Chat tab.
    let wasBusy = false;
    effect(() => {
      const busy = this.chatService.isBusy();
      if (wasBusy && !busy && untracked(() => this.panelsMode() && this.activePanel() === 'sheet')) {
        this.panelSwitcher.unread.set(true);
      }
      wasBusy = busy;
    });

    // Clean up service state on destroy
    this.destroyRef.onDestroy(() => {
      this.chatService.setCharacterId(null);
      this.characterService.activeCharacterId.set(null);
      this.characterVersionService.activeCharacterId.set(null);
      this.characterImageService.activeCharacterId.set(null);
    });
  }

  onWindowResize(): void {
    this.updateLayoutWidth();
  }

  private sendPendingPdf(characterId: string): void {
    const chat = this.chat();
    if (!chat || this.selectedCharacterId() !== characterId) return;
    const pdf = this.characterImportService.takePdf(characterId);
    if (!pdf) return;
    chat.sendAttachment(pdf);
    // The import happens in the chat: show it.
    this.showPanel('chat');
  }

  /** Scrolls to a panel; without panels there is nothing to scroll. */
  private showPanel(panel: PagePanel): void {
    const panels = this.panels()?.nativeElement;
    if (!panels || !this.panelsMode()) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    panels.scrollTo({
      left: panel === 'chat' ? panels.clientWidth : 0,
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
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

    const chat = this.chat();
    if (!chat) {
      return;
    }

    event.preventDefault();
    if (this.panelsMode() && this.activePanel() !== 'chat') {
      this.focusChatOnArrival = true;
      this.showPanel('chat');
    } else {
      chat.focusInput();
    }
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
        portraitUrl: portraitUrlOf(this.characterImages()),
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

  async onCloneCharacter(): Promise<void> {
    const charId = this.selectedCharacterId();
    if (!charId || !this.canClone() || this.cloning()) return;
    this.cloning.set(true);
    try {
      const cloneId = await this.characterImportService.cloneCharacter(charId);
      this.toastService.show('Karakter gekloond — dit is nu je eigen kopie.', 'success');
      await this.router.navigate(['/characters', cloneId]);
    } catch (e) {
      logger.error('Failed to clone character:', e);
      this.toastService.showCallableError(e, 'Klonen is mislukt. Probeer het opnieuw.');
    } finally {
      this.cloning.set(false);
    }
  }

  /** Archiving only moves the character out of the list; the sheet stays open and usable. */
  async onArchivedChange(archived: boolean): Promise<void> {
    const charId = this.selectedCharacterId();
    if (!charId || !this.isOwner()) return;
    try {
      await this.characterService.setArchived(charId, archived);
      this.toastService.show(
        archived
          ? 'Karakter gearchiveerd — je vindt het terug onder "Archived" in je karakterlijst.'
          : 'Karakter teruggezet in je karakterlijst.',
        'success'
      );
    } catch (e) {
      logger.error('Failed to archive character:', e);
      this.toastService.show(archived ? 'Archiveren is mislukt. Probeer het opnieuw.' : 'Terugzetten is mislukt. Probeer het opnieuw.', 'error');
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
