import { ChangeDetectionStrategy, Component, signal, inject, input, output, effect, viewChild, ElementRef, afterNextRender, runInInjectionContext, EnvironmentInjector, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ChatService, ChatAttachment } from './chat.service';
import { marked } from 'marked';
import { DndCharacter } from '../shared/models/dnd-character.model';
import { ImageLightboxComponent } from './image-lightbox.component';
import { ChatHistoryPanelComponent } from './chat-history-panel.component';
import { readPdfAttachment } from './pdf-attachment';
import { dayLabel, formatTime, isSameDay } from './chat-view';

@Component({
  selector: 'app-chat',
  imports: [FormsModule, ImageLightboxComponent, ChatHistoryPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.flex]': 'true',
    '[class.flex-col]': 'true',
    '[class.h-full]': 'true',
    '(document:click)': 'onDocumentClick()'
  },
  template: `
    @if (lightboxUrl()) {
      <app-image-lightbox [url]="lightboxUrl()!" (closed)="closeLightbox()" />
    }

    <div class="relative flex flex-col h-full overflow-hidden bg-white">
      <div class="flex items-center gap-1.5 py-1 px-1.5 border-b border-gray-200 bg-gradient-to-br from-primary to-secondary text-white rounded-2xl">
        <button
          type="button"
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-none bg-white/20 text-white hover:bg-white/35 cursor-pointer"
          aria-label="Eerdere gesprekken"
          title="Eerdere gesprekken"
          (click)="historyOpen.set(true)"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l4 2" />
          </svg>
        </button>
        <h2 class="!m-0 min-w-0 flex-1 truncate text-center !text-sm !leading-7 font-bold">{{ title() }}</h2>
        <button
          type="button"
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-none bg-white/20 text-white hover:bg-white/35 cursor-pointer"
          aria-label="Nieuw gesprek"
          title="Nieuw gesprek"
          (click)="startNewChat()"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12.4 14.6 8 16l1.4-4.4z" />
          </svg>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-gray-50 scrollbar-thin" #messagesContainer>
        @if (messages().length === 0) {
          <div class="text-center text-gray-600 m-auto px-2">
            <p class="my-2 text-sm">Ask about your character!</p>
            <p class="italic text-xs text-gray-400">Try: "Change my class to Rogue"</p>
          </div>
        }

        @if (hasEarlierMessages()) {
          <button
            type="button"
            class="self-center rounded-md border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 cursor-pointer"
            (click)="loadEarlierMessages()"
          >Eerdere berichten laden</button>
        }

        @for (row of rows(); track row.message.id) {
          @let message = row.message;
          @if (row.dayLabel) {
            <div class="flex items-center gap-2 text-[0.7rem] text-gray-500 before:h-px before:flex-1 before:bg-gray-200 after:h-px after:flex-1 after:bg-gray-200">
              {{ row.dayLabel }}
            </div>
          }
          @if (message.sender === 'system') {
            <div class="max-w-[85%] p-3 rounded-lg self-start bg-amber-50 border border-amber-200 rounded-bl-sm animate-slide-in text-sm">
              <div class="leading-relaxed flex items-center gap-2">
                @if (message.isUpdatingCharacter) {
                  <div class="flex gap-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce-dot"></span>
                    <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce-dot [animation-delay:-0.16s]"></span>
                    <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce-dot [animation-delay:-0.32s]"></span>
                  </div>
                }
                <span class="text-amber-800">{{ message.text }}</span>
                @if (message.versionNumber) {
                  <button
                    type="button"
                    (click)="viewVersions.emit()"
                    class="text-xs font-semibold text-amber-800 underline hover:no-underline shrink-0 bg-transparent border-none cursor-pointer p-0"
                    title="Versiegeschiedenis openen"
                  >versie {{ message.versionNumber }}</button>
                }
                @if (message.isUpdatingCharacter) {
                  <button
                    type="button"
                    (click)="cancelCharacterUpdate(message.id)"
                    class="text-xs text-amber-700 underline hover:no-underline ml-auto shrink-0 bg-transparent border-none cursor-pointer p-0"
                  >Annuleren</button>
                }
              </div>
            </div>
          } @else if (message.text || message.images?.length || message.pdfFileName) {
            <div
              class="max-w-[85%] p-3 rounded-lg animate-slide-in text-sm"
              [class]="message.sender === 'user'
                ? 'self-end bg-primary text-white rounded-br-sm'
                : message.sender === 'error'
                ? 'self-start bg-red-50 border border-red-200 text-red-700 rounded-bl-sm'
                : 'self-start bg-white border border-gray-200 rounded-bl-sm'"
            >
              <div class="flex justify-between mb-2 text-xs opacity-80">
                <span class="font-semibold">{{ message.sender === 'user' ? 'You' : 'The Sidekick' }}</span>
                <span class="pl-2 text-[0.7rem]">{{ formatTime(message.timestamp) }}</span>
              </div>
              <div class="leading-relaxed">
                @if (message.pdfFileName) {
                  <div class="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-md"
                    [class]="message.sender === 'user' ? 'bg-white/15' : 'bg-gray-100'">
                    <svg class="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"/>
                    </svg>
                    <span class="text-xs truncate">{{ message.pdfFileName }}</span>
                  </div>
                }
                @if (message.sender === 'user') {
                  <p class="m-0 whitespace-pre-wrap break-words">{{ message.text }}</p>
                } @else {
                  <div class="prose prose-sm prose-gray max-w-none" [innerHTML]="parseMarkdown(message.text)"></div>
                }

                @if (message.images && message.images.length > 0) {
                  <div class="mt-3 flex flex-col gap-2">
                    @for (image of message.images; track $index) {
                      <img
                        [src]="image.url"
                        [alt]="'Generated image ' + ($index + 1)"
                        class="max-w-full rounded-lg border border-gray-200 cursor-zoom-in hover:opacity-90 transition-opacity"
                        loading="lazy"
                        (click)="openLightbox(image.url)"
                      />
                    }
                  </div>
                }
              </div>
            </div>
          }
        }

        @if (isWaitingForAnswer()) {
          <div class="max-w-[85%] p-3 rounded-lg self-start bg-white border border-gray-200 animate-slide-in text-sm">
            <div class="leading-relaxed">
              <div class="flex gap-1 py-1">
                <span class="w-1.5 h-1.5 rounded-full bg-primary animate-bounce-dot"></span>
                <span class="w-1.5 h-1.5 rounded-full bg-primary animate-bounce-dot [animation-delay:-0.16s]"></span>
                <span class="w-1.5 h-1.5 rounded-full bg-primary animate-bounce-dot [animation-delay:-0.32s]"></span>
              </div>
            </div>
          </div>
        }
      </div>

      <div class="border-t border-gray-200 bg-white"
        (dragover)="onDragOver($event)"
        (dragleave)="onDragLeave($event)"
        (drop)="onDrop($event)"
        [class.ring-2]="isDragOver()"
        [class.ring-primary]="isDragOver()"
        [class.ring-inset]="isDragOver()"
      >
        @if (isImageMode()) {
          <div class="flex items-center gap-2 px-4 pt-3 pb-1">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200">
              <span>🎨</span>
              <span>Afbeelding genereren</span>
            </span>
            <span class="text-xs text-gray-400">Stuurt naar Gemini beeldgenerator</span>
          </div>
        }
        @if (pendingAttachment()) {
          <div class="flex items-center gap-2 px-4 pt-3 pb-1">
            <span class="inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200">
              <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"/>
              </svg>
              <span class="truncate max-w-[180px]">{{ pendingAttachment()!.fileName }}</span>
              <button type="button" (click)="removeAttachment()" class="flex items-center justify-center w-4 h-4 rounded-full hover:bg-blue-200 transition-colors">
                <svg class="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
                </svg>
              </button>
            </span>
          </div>
        }
        @if (isDragOver()) {
          <div class="flex items-center justify-center gap-2 px-4 py-3 text-sm text-primary font-medium">
            <svg class="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
            </svg>
            <span>Drop PDF here</span>
          </div>
        }
        <div class="flex gap-2 p-4" [class.pt-2]="isImageMode() || pendingAttachment()">
          <div class="relative flex-1 flex items-center border rounded-lg transition-all duration-200"
            [class]="isImageMode()
              ? 'border-purple-400 focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-200'
              : 'border-gray-200 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10'"
            [class.bg-gray-100]="isLoading()"
          >
            <div class="relative">
              <button
                type="button"
                (click)="toggleActionMenu($event)"
                [disabled]="isLoading()"
                class="flex items-center justify-center w-8 h-8 ml-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg class="w-4 h-4 transition-transform duration-150" [class.rotate-45]="showActionMenu()" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"/>
                </svg>
              </button>
              @if (showActionMenu()) {
                <div class="absolute bottom-full left-0 mb-2 w-52 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-10">
                  <button
                    type="button"
                    (click)="openPdfPicker()"
                    class="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <svg class="w-4 h-4 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"/>
                    </svg>
                    <span>Import PDF</span>
                  </button>
                  <button
                    type="button"
                    (click)="insertAction('maak afbeelding')"
                    class="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <span class="text-base">🎨</span>
                    <span>Genereer afbeelding</span>
                  </button>
                </div>
              }
            </div>
            <input
              #messageInput
              type="text"
              [(ngModel)]="newMessage"
              (keyup.enter)="sendMessage()"
              [disabled]="isLoading()"
              [placeholder]="pendingAttachment() ? 'Import this character (or add instructions)...' : 'Type a message...'"
              class="flex-1 px-2 py-2 text-sm bg-transparent border-none outline-none disabled:cursor-not-allowed"
            />
          </div>
          <button
            (click)="sendMessage()"
            [disabled]="isLoading() || (!newMessage().trim() && !pendingAttachment())"
            class="px-4 py-2 text-sm font-semibold text-white border-none rounded-lg cursor-pointer transition-all duration-200 disabled:bg-gray-300 disabled:cursor-not-allowed"
            [class]="isImageMode()
              ? 'bg-purple-600 hover:bg-purple-700'
              : 'bg-primary hover:bg-primary-dark'"
          >
            {{ isLoading() ? '...' : isImageMode() ? '🎨' : 'Send' }}
          </button>
        </div>
      </div>

      @if (error()) {
        <div class="flex items-center justify-between p-3 mx-4 mb-4 bg-red-50 border border-red-200 rounded-lg text-red-700 animate-slide-in text-sm">
          <span class="flex-1">{{ error() }}</span>
          <button (click)="clearError()" class="bg-transparent border-none text-xl text-red-700 cursor-pointer p-0 w-5 h-5 leading-none hover:opacity-70 ml-2">&times;</button>
        </div>
      }

      <app-chat-history-panel
        [open]="historyOpen()"
        [conversations]="conversations()"
        [activeChatId]="activeChatId()"
        [characterName]="character()?.name ?? ''"
        [canLoadMore]="hasMoreConversations()"
        (selectChat)="openChat($event)"
        (newChat)="startNewChat()"
        (rename)="renameChat($event)"
        (remove)="deleteChat($event)"
        (loadMore)="loadMoreConversations()"
        (closed)="historyOpen.set(false)"
      />
    </div>

    <input
      #pdfFileInput
      type="file"
      accept=".pdf"
      class="hidden"
      (change)="onFileSelected($event)"
    />
  `
})
export class ChatComponent {
  // Optional character input - when provided, enables character-aware mode
  character = input<DndCharacter | null>(null);

  /** The user asks for the version history (from a finished character update). */
  viewVersions = output<void>();

  private chatService = inject(ChatService);
  private sanitizer = inject(DomSanitizer);
  private environmentInjector = inject(EnvironmentInjector);

  messages = this.chatService.messages;
  conversations = this.chatService.conversations;
  activeChatId = this.chatService.activeChatId;
  hasMoreConversations = this.chatService.hasMoreConversations;
  hasEarlierMessages = this.chatService.hasEarlierMessages;
  /** True while the open conversation waits for an answer; sending is paused until it is there. */
  isLoading = this.chatService.isBusy;

  newMessage = signal<string>('');
  error = signal<string>('');
  historyOpen = signal(false);
  messagesContainer = viewChild<ElementRef<HTMLDivElement>>('messagesContainer');
  messageInput = viewChild<ElementRef<HTMLInputElement>>('messageInput');
  pdfFileInput = viewChild<ElementRef<HTMLInputElement>>('pdfFileInput');
  isImageMode = computed(() => this.chatService.isImageGenerationRequest(this.newMessage()));

  lightboxUrl = signal<string | null>(null);
  showActionMenu = signal(false);
  pendingAttachment = signal<ChatAttachment | null>(null);
  isDragOver = signal(false);

  title = computed(() => this.chatService.activeConversation()?.title || 'The Sidekick');

  /** The messages with a day label on the first message of each day. */
  rows = computed(() => {
    const now = new Date();
    let previous: Date | undefined;
    return this.messages().map(message => {
      const label = !previous || !isSameDay(previous, message.timestamp) ? dayLabel(message.timestamp, now) : null;
      previous = message.timestamp;
      return { message, dayLabel: label };
    });
  });

  /** An answer is on its way but nothing of it can be shown yet: the typing indicator stands in. */
  isWaitingForAnswer = computed(() =>
    this.messages().some(message => message.inProgress && !message.text && !message.images?.length)
  );

  /** Changes when a message is added at the end or the last one grows; loading earlier messages leaves it alone. */
  private lastMessageMark = computed(() => {
    const messages = this.messages();
    const last = messages[messages.length - 1];
    return last ? `${last.id}:${last.sender}:${last.text.length}:${last.images?.length ?? 0}` : '';
  });

  constructor() {
    // Configure marked options
    marked.setOptions({
      breaks: true,
      gfm: true
    });

    // Update current character whenever it changes
    effect(() => {
      this.chatService.setCurrentCharacter(this.character());
    });

    effect(() => {
      const container = this.messagesContainer();
      if (!container || !this.lastMessageMark()) {
        return;
      }
      this.isWaitingForAnswer();
      runInInjectionContext(this.environmentInjector, () => {
        afterNextRender(() => {
          this.scrollToBottom(container.nativeElement);
        });
      });
    });
  }

  /** Send a PDF right away, as if the user attached it and pressed send. */
  sendAttachment(attachment: ChatAttachment): void {
    this.pendingAttachment.set(attachment);
    this.sendMessage();
  }

  sendMessage(): void {
    const messageText = this.newMessage().trim();
    const attachment = this.pendingAttachment();

    if ((!messageText && !attachment) || this.isLoading()) {
      return;
    }

    // Clear previous errors
    this.error.set('');
    this.newMessage.set('');
    this.pendingAttachment.set(null);

    // Use a default message when only an attachment is provided.
    // From here the backend owns the turn; its progress arrives through the messages.
    void this.chatService.send(messageText || 'Import this character', attachment ?? undefined);
  }

  focusInput(): void {
    if (this.isLoading()) {
      return;
    }
    const input = this.messageInput();
    if (!input) {
      return;
    }
    input.nativeElement.focus();
  }

  appendToMessage(text: string): void {
    if (this.isLoading() || !text) {
      return;
    }
    this.newMessage.update(current => `${current}${text}`);
  }

  startNewChat(): void {
    this.chatService.newChat();
    this.historyOpen.set(false);
    this.focusInput();
  }

  openChat(chatId: string): void {
    this.chatService.openChat(chatId);
    this.historyOpen.set(false);
  }

  renameChat(change: { id: string; title: string }): void {
    void this.chatService.renameChat(change.id, change.title);
  }

  deleteChat(chatId: string): void {
    void this.chatService.deleteChat(chatId);
  }

  loadMoreConversations(): void {
    this.chatService.loadMoreConversations();
  }

  loadEarlierMessages(): void {
    this.chatService.loadEarlierMessages();
  }

  toggleActionMenu(event: Event): void {
    event.stopPropagation();
    this.showActionMenu.update(v => !v);
  }

  onDocumentClick(): void {
    this.showActionMenu.set(false);
  }

  insertAction(text: string): void {
    this.newMessage.set(text);
    this.showActionMenu.set(false);
    this.messageInput()?.nativeElement.focus();
  }

  openPdfPicker(): void {
    this.showActionMenu.set(false);
    this.pdfFileInput()?.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.processFile(file);
    }
    // Reset so the same file can be selected again
    input.value = '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);

    const file = event.dataTransfer?.files[0];
    if (file) {
      this.processFile(file);
    }
  }

  removeAttachment(): void {
    this.pendingAttachment.set(null);
  }

  clearError(): void {
    this.error.set('');
  }

  formatTime(timestamp: Date): string {
    return formatTime(timestamp);
  }

  parseMarkdown(text: string): SafeHtml {
    const html = marked.parse(text, { async: false }) as string;
    return this.sanitizer.sanitize(1, html) || '';
  }

  /** Stop a running character update; the backend then drops the draft it is making. */
  cancelCharacterUpdate(messageId: string): void {
    void this.chatService.cancelCharacterUpdate(messageId);
  }

  private async processFile(file: File): Promise<void> {
    try {
      this.pendingAttachment.set(await readPdfAttachment(file));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed to read PDF file.');
    }
  }

  openLightbox(url: string): void {
    this.lightboxUrl.set(url);
  }

  closeLightbox(): void {
    this.lightboxUrl.set(null);
  }

  private scrollToBottom(container: HTMLElement): void {
    container.scrollTop = container.scrollHeight;
  }
}
