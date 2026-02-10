import { Component, signal, inject, input, effect, viewChild, ElementRef, afterNextRender, runInInjectionContext, EnvironmentInjector } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ChatService, Message } from './chat.service';
import { marked } from 'marked';
import { DndCharacter } from '../shared/schemas/dnd-character.schema';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  host: {
    '[class.flex]': 'true',
    '[class.flex-col]': 'true',
    '[class.h-full]': 'true'
  },
  template: `
    <div class="flex flex-col h-full bg-white">
      <div class="p-4 border-b border-gray-200 bg-gradient-to-br from-primary to-secondary text-white">
        <h2 class="m-0 mb-1 text-lg font-bold">Sidekick</h2>
        <p class="m-0 opacity-90 text-xs">Character building assistant</p>
      </div>

      <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-gray-50 scrollbar-thin" #messagesContainer>
        @if (messages().length === 0) {
          <div class="text-center text-gray-600 m-auto px-2">
            <p class="my-2 text-sm">Ask about your character!</p>
            <p class="italic text-xs text-gray-400">Try: "Change my class to Rogue"</p>
          </div>
        }
        
        @for (message of messages(); track message.id) {
          @if (message.text) {
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
                @if (message.sender === 'user') {
                  <p class="m-0 whitespace-pre-wrap break-words">{{ message.text }}</p>
                } @else {
                  <div class="prose prose-sm prose-gray max-w-none" [innerHTML]="parseMarkdown(message.text)"></div>
                }
                
                @if (message.images && message.images.length > 0) {
                  <div class="mt-3 flex flex-col gap-2">
                    @for (image of message.images; track $index) {
                      <img 
                        [src]="'data:' + image.mimeType + ';base64,' + image.data"
                        [alt]="'Generated image ' + ($index + 1)"
                        class="max-w-full rounded-lg border border-gray-200"
                        loading="lazy"
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

      <div class="flex gap-2 p-4 border-t border-gray-200 bg-white">
        <input 
          #messageInput
          type="text" 
          [(ngModel)]="newMessage"
          (keyup.enter)="sendMessage()"
          [disabled]="isLoading()"
          placeholder="Type a message..."
          class="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
        <button 
          (click)="sendMessage()"
          [disabled]="isLoading() || !newMessage().trim()"
          class="px-4 py-2 text-sm font-semibold text-white bg-primary border-none rounded-lg cursor-pointer transition-all duration-200 hover:bg-primary-dark disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {{ isLoading() ? '...' : 'Send' }}
        </button>
      </div>

      @if (error()) {
        <div class="flex items-center justify-between p-3 mx-4 mb-4 bg-red-50 border border-red-200 rounded-lg text-red-700 animate-slide-in text-sm">
          <span class="flex-1">{{ error() }}</span>
          <button (click)="clearError()" class="bg-transparent border-none text-xl text-red-700 cursor-pointer p-0 w-5 h-5 leading-none hover:opacity-70 ml-2">&times;</button>
        </div>
      }
    </div>
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

  private chatService = inject(ChatService);
  private sanitizer = inject(DomSanitizer);
  private environmentInjector = inject(EnvironmentInjector);

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
    
    if (!messageText || this.isLoading()) {
      return;
    }

    // Clear previous errors
    this.error.set('');

    // Add user message
    const userMessage: Message = {
      id: this.generateId(),
      sender: 'user',
      text: messageText,
      timestamp: new Date()
    };

    this.messages.update(msgs => [...msgs, userMessage]);
    this.newMessage.set('');
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
    this.chatService.sendMessage(messageText).subscribe({
      next: (response) => {
        this.updateMessage(aiMessageId, response.text, response.images);
      },
      complete: () => {
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('AI Service Error:', err);
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

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private updateMessage(messageId: string, text: string, images?: { mimeType: string; data: string }[]): void {
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

  private scrollToBottom(container: HTMLElement): void {
    container.scrollTop = container.scrollHeight;
  }
}
