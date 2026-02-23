import { ChangeDetectionStrategy, Component, signal, inject, input, effect, viewChild, ElementRef, afterNextRender, runInInjectionContext, EnvironmentInjector, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { ChatService, Message, ChatAttachment } from './chat.service';
import { marked } from 'marked';
import { DndCharacter } from '../shared/models/dnd-character.model';
import { ImageLightboxComponent } from './image-lightbox.component';
import * as logger from '../shared/logger';

const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

@Component({
  selector: 'app-chat',
  imports: [FormsModule, ImageLightboxComponent],
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

    <div class="flex flex-col h-full bg-white">
      <div class="py-1.5 px-4 border-b border-gray-200 bg-gradient-to-br from-primary to-secondary text-white rounded-2xl text-center">
        <h2 class="!m-0 text-sm font-bold">The Sidekick</h2>
      </div>

      <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-gray-50 scrollbar-thin" #messagesContainer>
        @if (messages().length === 0) {
          <div class="text-center text-gray-600 m-auto px-2">
            <p class="my-2 text-sm">Ask about your character!</p>
            <p class="italic text-xs text-gray-400">Try: "Change my class to Rogue"</p>
          </div>
        }

        @for (message of messages(); track message.id) {
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
                @if (message.isUpdatingCharacter) {
                  <button
                    (click)="cancelCharacterUpdate()"
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

        @if (isLoading()) {
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
            <span class="text-xs text-gray-400">Stuurt naar fal.ai beeldgenerator</span>
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

  messages = signal<Message[]>([]);
  newMessage = signal<string>('');
  isLoading = signal<boolean>(false);
  error = signal<string>('');
  messagesContainer = viewChild<ElementRef<HTMLDivElement>>('messagesContainer');
  messageInput = viewChild<ElementRef<HTMLInputElement>>('messageInput');
  pdfFileInput = viewChild<ElementRef<HTMLInputElement>>('pdfFileInput');
  isImageMode = computed(() => this.chatService.isImageGenerationRequest(this.newMessage()));

  lightboxUrl = signal<string | null>(null);
  showActionMenu = signal(false);
  pendingAttachment = signal<ChatAttachment | null>(null);
  isDragOver = signal(false);

  private chatService = inject(ChatService);
  private sanitizer = inject(DomSanitizer);
  private environmentInjector = inject(EnvironmentInjector);
  private ai2Subscription: Subscription | null = null;
  private lastAttachments: ChatAttachment[] | undefined;

  constructor() {
    // Load chat history from service
    this.messages.set(this.chatService.getMessages());

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
      if (!container) {
        return;
      }
      if (this.messages().length === 0 && !this.isLoading()) {
        return;
      }
      runInInjectionContext(this.environmentInjector, () => {
        afterNextRender(() => {
          this.scrollToBottom(container.nativeElement);
        });
      });
    });
  }

  sendMessage(): void {
    const messageText = this.newMessage().trim();
    const attachment = this.pendingAttachment();

    if ((!messageText && !attachment) || this.isLoading()) {
      return;
    }

    // Clear previous errors
    this.error.set('');

    // Use a default message when only an attachment is provided
    const displayText = messageText || 'Import this character';

    // Add user message
    const userMessage: Message = {
      id: this.generateId(),
      sender: 'user',
      text: displayText,
      timestamp: new Date(),
      ...(attachment && { pdfFileName: attachment.fileName }),
    };

    this.messages.update(msgs => [...msgs, userMessage]);
    this.newMessage.set('');
    this.pendingAttachment.set(null);
    this.isLoading.set(true);

    const aiMessageId = this.generateId();
    const aiMessage: Message = {
      id: aiMessageId,
      sender: 'ai',
      text: '',
      timestamp: new Date()
    };
    this.messages.update(msgs => [...msgs, aiMessage]);

    // Get AI response
    const attachments = attachment ? [attachment] : undefined;
    this.chatService.sendMessage(displayText, attachments).subscribe({
      next: (response) => {
        this.updateMessage(aiMessageId, response.text, response.images);

        if (response.shouldUpdateCharacter) {
          this.lastAttachments = attachments;
          this.startCharacterUpdate(response.text);
        }
      },
      complete: () => {
        this.isLoading.set(false);
      },
      error: (err) => {
        logger.error('AI Service Error:', err);
        const errorMessage = this.getErrorMessage(err);
        this.error.set(errorMessage);

        const errorMsg: Message = {
          id: this.generateId(),
          sender: 'error',
          text: `Sorry, I encountered an error: ${errorMessage}`,
          timestamp: new Date()
        };
        this.messages.update(msgs => [...msgs, errorMsg]);
        this.isLoading.set(false);
      }
    });
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
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    }).format(timestamp);
  }

  parseMarkdown(text: string): SafeHtml {
    const html = marked.parse(text, { async: false }) as string;
    return this.sanitizer.sanitize(1, html) || '';
  }

  cancelCharacterUpdate(): void {
    if (this.ai2Subscription) {
      this.ai2Subscription.unsubscribe();
      this.ai2Subscription = null;
    }
    this.messages.update(msgs =>
      msgs.map(m => m.isUpdatingCharacter
        ? { ...m, text: 'Karakter aanpassen geannuleerd.', isUpdatingCharacter: false }
        : m
      )
    );
  }

  private startCharacterUpdate(ai1Response: string): void {
    const updateMessageId = this.generateId();
    const updateMessage: Message = {
      id: updateMessageId,
      sender: 'system',
      text: 'Karakter wordt aangepast...',
      timestamp: new Date(),
      isUpdatingCharacter: true,
    };
    this.messages.update(msgs => [...msgs, updateMessage]);

    this.ai2Subscription = this.chatService.generateCharacterDraft(ai1Response, this.lastAttachments).subscribe({
      next: () => {
        this.messages.update(msgs =>
          msgs.map(m => m.id === updateMessageId
            ? { ...m, text: 'Karakter is aangepast!', isUpdatingCharacter: false }
            : m
          )
        );
      },
      error: (err) => {
        logger.error('Character update error:', err);
        this.messages.update(msgs =>
          msgs.map(m => m.id === updateMessageId
            ? { ...m, text: 'Karakter aanpassen mislukt.', isUpdatingCharacter: false, sender: 'error' as const }
            : m
          )
        );
      },
    });
  }

  private processFile(file: File): void {
    if (file.type !== 'application/pdf') {
      this.error.set('Only PDF files are supported.');
      return;
    }

    if (file.size > MAX_PDF_SIZE_BYTES) {
      this.error.set('PDF file exceeds 10 MB limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix to get raw base64
      const base64 = result.split(',')[1];

      this.pendingAttachment.set({
        type: 'pdf',
        fileName: file.name,
        mimeType: 'application/pdf',
        data: base64,
      });
    };
    reader.onerror = () => {
      this.error.set('Failed to read PDF file.');
    };
    reader.readAsDataURL(file);
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private updateMessage(messageId: string, text: string, images?: { url: string; mimeType: string }[]): void {
    this.messages.update(messages =>
      messages.map(message =>
        message.id === messageId ? { ...message, text, images } : message
      )
    );
  }

  private getErrorMessage(error: unknown): string {
    const e = error as { status?: number; error?: { error?: { message?: string } }; message?: string };
    if (e.status === 0) {
      return 'Network error. Please check your connection.';
    }
    if (e.status === 401) {
      return 'API key invalid or missing. Please check your configuration.';
    }
    if (e.status === 429) {
      return 'Rate limit exceeded. Please try again later.';
    }
    if (e.error?.error?.message) {
      return e.error.error.message;
    }
    return e.message || 'An unexpected error occurred.';
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
