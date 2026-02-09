import { Component, signal, inject, input, effect, ViewChild, ElementRef, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import { CharacterChatService, ChatMessage } from '../../../../core/services/character-chat.service';
import { DndCharacter } from '../../../../shared/schemas/dnd-character.schema';

@Component({
  selector: 'app-character-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex flex-col h-full bg-base-100">
      <!-- Header -->
      <div class="p-4 border-b border-base-300 bg-base-200">
        <h3 class="font-bold">Sidekick Chat</h3>
        <p class="text-xs opacity-70">Discuss changes with the AI</p>
      </div>

      <!-- Messages -->
      <div class="flex-1 overflow-y-auto p-4 space-y-4" #messagesContainer>
        @if (messages().length === 0) {
          <div class="text-center opacity-50 text-sm mt-10">
            <p>Say "Change my class to Rogue" or "Give me a cool sword"</p>
          </div>
        }

        @for (message of messages(); track message.id) {
          <div class="chat" [class.chat-start]="message.sender !== 'user'" [class.chat-end]="message.sender === 'user'">
            <div class="chat-header text-xs opacity-50 mb-1">
              {{ message.sender === 'user' ? 'You' : 'Sidekick' }}
              <time class="text-[10px] ml-1">{{ message.timestamp | date:'shortTime' }}</time>
            </div>
            <div 
              class="chat-bubble text-sm"
              [class.chat-bubble-primary]="message.sender === 'user'"
              [class.chat-bubble-secondary]="message.sender === 'ai'"
              [class.chat-bubble-error]="message.sender === 'error'"
            >
              @if (message.sender === 'user') {
                {{ message.text }}
              } @else {
                <div class="prose prose-sm max-w-none" [innerHTML]="parseMarkdown(message.text)"></div>
              }
            </div>
          </div>
        }

        @if (isLoading() && !isStreaming()) {
          <div class="chat chat-start">
            <div class="chat-bubble chat-bubble-secondary">
              <span class="loading loading-dots loading-xs"></span>
            </div>
          </div>
        }
      </div>

      <!-- Input -->
      <div class="p-4 border-t border-base-300 bg-base-100">
        <div class="flex gap-2">
          <input 
            type="text" 
            [(ngModel)]="newMessage"
            (keyup.enter)="sendMessage()"
            [disabled]="isLoading()"
            placeholder="Type a message..."
            class="input input-bordered flex-1 input-sm"
          />
          <button 
            class="btn btn-primary btn-sm"
            (click)="sendMessage()"
            [disabled]="isLoading() || !newMessage().trim()"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  `
})
export class CharacterChatComponent {
  character = input.required<DndCharacter>();
  
  messages: Signal<ChatMessage[]>;
  newMessage = signal<string>('');
  isLoading = signal<boolean>(false);
  isStreaming = signal<boolean>(false);

  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;

  private chatService = inject(CharacterChatService);
  private sanitizer = inject(DomSanitizer);

  constructor() {
    this.messages = this.chatService.getMessages();

    // Reset chat when character changes (handled by service reset in parent or effect here?)
    // The spec says "When the user switches characters ... the chat resets".
    // I'll handle reset in the parent or here.
    
    effect(() => {
        // When character input changes (ID changes effectively), we might want to reset.
        // But character input changes on every keystroke/update too.
        // So we need to track ID changes.
        // Actually, the parent switches the component instance or inputs.
        // Let's assume the service handles the state, and we just display it.
        // But we need to know when to reset.
    });
  }

  sendMessage() {
    const text = this.newMessage().trim();
    if (!text || this.isLoading()) return;

    this.newMessage.set('');
    this.isLoading.set(true);
    this.isStreaming.set(false);
    this.scrollToBottom();

    this.chatService.sendMessage(text, this.character()).subscribe({
      next: () => {
        if (!this.isStreaming()) {
          this.isStreaming.set(true);
        }
      },
      complete: () => {
        this.isLoading.set(false);
        this.isStreaming.set(false);
        this.scrollToBottom();
      },
      error: (err) => {
        console.error(err);
        this.isLoading.set(false);
        this.isStreaming.set(false);
        this.scrollToBottom();
      }
    });
  }

  parseMarkdown(text: string): SafeHtml {
    const html = marked.parse(text, { async: false }) as string;
    return this.sanitizer.sanitize(1, html) || '';
  }

  private scrollToBottom() {
    setTimeout(() => {
      if (this.messagesContainer) {
        this.messagesContainer.nativeElement.scrollTop = this.messagesContainer.nativeElement.scrollHeight;
      }
    }, 100);
  }
}
