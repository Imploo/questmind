import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { ChatConversation } from './chat.models';
import { conversationTime, filterConversations, groupConversations } from './chat-view';

/**
 * The earlier conversations of a character, as a drawer that slides over the chat
 * panel. Purely presentational: the chat panel decides what selecting, renaming
 * and deleting do.
 */
@Component({
  selector: 'app-chat-history-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'absolute inset-0 z-20',
    '[class.pointer-events-none]': '!open()',
    '(document:keydown.escape)': 'onEscape()',
  },
  template: `
    <div
      class="absolute inset-0 bg-[rgba(28,16,62,0.45)] transition-opacity duration-200 motion-reduce:transition-none"
      [class.opacity-0]="!open()"
      (click)="closed.emit()"
    ></div>

    <div
      class="absolute inset-y-0 left-0 flex w-[88%] max-w-sm flex-col gap-2.5 bg-paper px-3 pb-3 pt-4 text-ink transition-transform duration-200 ease-out motion-reduce:transition-none"
      [class.-translate-x-full]="!open()"
      [class.shadow-2xl]="open()"
      [attr.inert]="open() ? null : ''"
      role="dialog"
      aria-label="Eerdere gesprekken"
    >
      <div class="flex items-center justify-between px-1">
        <div class="min-w-0">
          <h3 class="qm-display text-base leading-tight">Gesprekken</h3>
          @if (characterName()) {
            <p class="truncate text-xs qm-muted">met {{ characterName() }}</p>
          }
        </div>
        <button
          #closeButton
          type="button"
          class="qm-btn qm-btn-ghost qm-btn-icon"
          aria-label="Sluiten"
          (click)="closed.emit()"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <button type="button" class="qm-btn qm-btn-primary qm-btn-block" (click)="newChat.emit()">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12.4 14.6 8 16l1.4-4.4z" />
        </svg>
        Nieuw gesprek
      </button>

      <input
        type="search"
        class="qm-input !py-2 !text-sm"
        placeholder="Zoek in gesprekken"
        aria-label="Zoek in gesprekken"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
      />

      <div class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto scrollbar-thin">
        @for (group of groups(); track group.label) {
          <div class="qm-eyebrow px-2 pb-0.5 pt-2.5 !text-[0.62rem]">
            {{ group.label }}
          </div>
          @for (conversation of group.conversations; track conversation.id) {
            @if (confirmingId() === conversation.id) {
              <div class="qm-alert my-0.5 flex flex-wrap items-center gap-1.5 !text-xs">
                <span class="basis-full">
                  “{{ conversation.title }}” verwijderen? Dit kan niet ongedaan worden gemaakt.
                </span>
                <button
                  type="button"
                  class="qm-btn qm-btn-sm !border-wine !bg-wine !text-white"
                  (click)="confirmRemove(conversation.id)"
                >Verwijderen</button>
                <button
                  type="button"
                  class="qm-btn qm-btn-sm"
                  (click)="confirmingId.set(null)"
                >Annuleren</button>
              </div>
            } @else {
              <div class="qm-item flex items-start !p-0" [class.is-active]="conversation.id === activeChatId()">
                @if (renamingId() === conversation.id) {
                  <div class="min-w-0 flex-1 py-1.5 pl-2 pr-0.5">
                    <input
                      #renameInput
                      type="text"
                      class="qm-input !px-2 !py-1 !text-sm font-semibold"
                      aria-label="Nieuwe titel"
                      maxlength="80"
                      [value]="conversation.title"
                      (keydown.enter)="finishRename(conversation, renameInput.value)"
                      (keydown.escape)="cancelRename($event)"
                      (blur)="finishRename(conversation, renameInput.value)"
                    />
                  </div>
                } @else {
                  <button
                    type="button"
                    class="min-w-0 flex-1 rounded-lg py-2 pl-3 pr-0.5 text-left"
                    [attr.aria-current]="conversation.id === activeChatId() ? 'true' : null"
                    (click)="selectChat.emit(conversation.id)"
                  >
                    <span class="block truncate text-sm font-semibold">{{ conversation.title }}</span>
                    <span class="block truncate text-xs qm-muted">{{ conversation.lastMessagePreview }}</span>
                    <span class="mt-1 flex flex-wrap items-center gap-1.5 text-[0.7rem] qm-muted">
                      <span class="tabular-nums">{{ time(conversation) }}</span>
                      @if (conversation.updatedCharacter) {
                        <span class="qm-badge !text-[0.62rem]">
                          Aangepast{{ conversation.lastVersionNumber ? ' · v' + conversation.lastVersionNumber : '' }}
                        </span>
                      }
                      @if (conversation.hasImages) {
                        <span class="qm-badge qm-badge-violet !text-[0.62rem]">Afbeelding</span>
                      }
                      @if (conversation.hasPdf) {
                        <span class="qm-badge qm-badge-info !text-[0.62rem]">PDF</span>
                      }
                    </span>
                  </button>
                }
                <button
                  type="button"
                  class="mr-1 mt-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-paper hover:text-ink"
                  [attr.aria-label]="'Acties voor ' + conversation.title"
                  [attr.aria-expanded]="menuId() === conversation.id"
                  (click)="toggleMenu(conversation.id)"
                >
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
                  </svg>
                </button>
              </div>
              @if (menuId() === conversation.id) {
                <div class="flex gap-1.5 px-2 pb-2 pt-1">
                  <button type="button" class="qm-btn qm-btn-sm" (click)="startRename(conversation.id)">Hernoemen</button>
                  <button type="button" class="qm-btn qm-btn-sm qm-btn-danger" (click)="askRemove(conversation.id)">Verwijderen</button>
                </div>
              }
            }
          }
        } @empty {
          <p class="px-3 py-6 text-center text-xs qm-muted">
            @if (query().trim()) {
              Geen gesprekken gevonden voor “{{ query().trim() }}”.
            } @else {
              Nog geen gesprekken met dit karakter.
            }
          </p>
        }

        @if (canLoadMore() && !query().trim()) {
          <button type="button" class="qm-btn qm-btn-sm mx-auto my-2" (click)="loadMore.emit()">Toon meer</button>
        }
      </div>
    </div>
  `
})
export class ChatHistoryPanelComponent {
  open = input(false);
  conversations = input.required<ChatConversation[]>();
  activeChatId = input<string | null>(null);
  characterName = input('');
  canLoadMore = input(false);

  selectChat = output<string>();
  newChat = output<void>();
  rename = output<{ id: string; title: string }>();
  remove = output<string>();
  loadMore = output<void>();
  closed = output<void>();

  query = signal('');
  menuId = signal<string | null>(null);
  renamingId = signal<string | null>(null);
  confirmingId = signal<string | null>(null);

  private readonly injector = inject(Injector);
  private readonly renameInput = viewChild<ElementRef<HTMLInputElement>>('renameInput');
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');

  /** Captured when the list changes, so "Vandaag" and "Gisteren" are right for what is shown. */
  private readonly today = computed(() => {
    this.conversations();
    this.open();
    return new Date();
  });

  groups = computed(() => groupConversations(filterConversations(this.conversations(), this.query()), this.today()));

  constructor() {
    // An open drawer takes the focus; a closed one forgets what was half done in it.
    effect(() => {
      if (this.open()) {
        // After the render: until then the panel is still inert and refuses the focus.
        afterNextRender(() => this.closeButton()?.nativeElement.focus({ preventScroll: true }), { injector: this.injector });
      } else {
        this.menuId.set(null);
        this.renamingId.set(null);
        this.confirmingId.set(null);
      }
    });

    effect(() => {
      const field = this.renameInput()?.nativeElement;
      if (field) {
        field.focus();
        field.select();
      }
    });
  }

  onEscape(): void {
    if (this.open()) {
      this.closed.emit();
    }
  }

  time(conversation: ChatConversation): string {
    return conversationTime(conversation, this.today());
  }

  toggleMenu(id: string): void {
    this.menuId.update(current => current === id ? null : id);
  }

  startRename(id: string): void {
    this.menuId.set(null);
    this.renamingId.set(id);
  }

  finishRename(conversation: ChatConversation, value: string): void {
    // Enter is followed by a blur; only the first of the two saves.
    if (this.renamingId() !== conversation.id) return;
    this.renamingId.set(null);
    const title = value.trim();
    if (title && title !== conversation.title) {
      this.rename.emit({ id: conversation.id, title });
    }
  }

  cancelRename(event: Event): void {
    // Escape leaves the title alone and keeps the drawer open.
    event.stopPropagation();
    this.renamingId.set(null);
  }

  askRemove(id: string): void {
    this.menuId.set(null);
    this.confirmingId.set(id);
  }

  confirmRemove(id: string): void {
    this.confirmingId.set(null);
    this.remove.emit(id);
  }
}
