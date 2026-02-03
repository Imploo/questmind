import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ChatService, Message } from './chat.service';
import { marked } from 'marked';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="w-full max-w-3xl mx-auto my-8 border border-gray-200 rounded-xl bg-white shadow-lg flex flex-col h-[calc(100vh-4rem)] max-h-[800px]">
      <div class="p-6 border-b border-gray-200 bg-gradient-to-br from-primary to-secondary text-white rounded-t-xl">
        <h2 class="m-0 mb-2 text-2xl font-bold">D&D Assistant</h2>
        <p class="m-0 opacity-90 text-sm">Ask me anything about creating D&D 5e characters!</p>
      </div>

      <div class="flex-1 overflow-y-auto p-6 flex flex-col gap-4 bg-gray-50 scrollbar-thin" #messagesContainer>
        @if (messages().length === 0) {
          <div class="text-center text-gray-600 m-auto">
            <p class="my-2">Start a conversation about your D&D character!</p>
            <p class="italic text-sm text-gray-400">Try: "Create a wizard with Tasha's Telekinesis"</p>
          </div>
        }
        
        @for (message of messages(); track message.id) {
          <div 
            class="max-w-[80%] p-4 rounded-xl animate-slide-in"
            [class]="message.sender === 'user' 
              ? 'self-end bg-primary text-white rounded-br-sm' 
              : message.sender === 'error'
              ? 'self-start bg-red-50 border border-red-200 text-red-700 rounded-bl-sm'
              : 'self-start bg-white border border-gray-200 rounded-bl-sm'"
          >
            <div class="flex justify-between mb-2 text-xs opacity-80">
              <span class="font-semibold">{{ message.sender === 'user' ? 'You' : 'The Sidekick' }}</span>
              <span class="text-[0.7rem]">{{ formatTime(message.timestamp) }}</span>
            </div>
            <div class="leading-relaxed">
              @if (message.sender === 'user') {
                <p class="m-0 whitespace-pre-wrap break-words">{{ message.text }}</p>
              } @else {
                <div class="prose prose-sm prose-gray max-w-none" [innerHTML]="parseMarkdown(message.text)"></div>
              }
            </div>
          </div>
        }

        @if (isLoading()) {
          <div class="max-w-[80%] p-4 rounded-xl self-start bg-white border border-gray-200 animate-slide-in">
            <div class="flex justify-between mb-2 text-xs opacity-80">
              <span class="font-semibold">The Sidekick</span>
            </div>
            <div class="leading-relaxed">
              <div class="flex gap-1 py-2">
                <span class="w-2 h-2 rounded-full bg-primary animate-bounce-dot"></span>
                <span class="w-2 h-2 rounded-full bg-primary animate-bounce-dot [animation-delay:-0.16s]"></span>
                <span class="w-2 h-2 rounded-full bg-primary animate-bounce-dot [animation-delay:-0.32s]"></span>
              </div>
            </div>
          </div>
        }
      </div>

      <div class="flex gap-3 p-6 border-t border-gray-200 bg-white rounded-b-xl">
        <input 
          type="text" 
          [(ngModel)]="newMessage"
          (keyup.enter)="sendMessage()"
          [disabled]="isLoading()"
          placeholder="Describe your character or ask a D&D 5e question..."
          class="flex-1 px-4 py-3 text-base border border-gray-200 rounded-lg outline-none transition-all duration-200 focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
        <button 
          (click)="sendMessage()"
          [disabled]="isLoading() || !newMessage().trim()"
          class="px-6 py-3 text-base font-semibold text-white bg-primary border-none rounded-lg cursor-pointer transition-all duration-200 hover:bg-primary-dark hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/30 active:translate-y-0 disabled:bg-gray-300 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
        >
          {{ isLoading() ? 'Sending...' : 'Send' }}
        </button>
      </div>

      @if (error()) {
        <div class="flex items-center justify-between p-4 mx-6 mb-6 bg-red-50 border border-red-200 rounded-lg text-red-700 animate-slide-in">
          <span>{{ error() }}</span>
          <button (click)="clearError()" class="bg-transparent border-none text-2xl text-red-700 cursor-pointer p-0 w-6 h-6 leading-none hover:opacity-70">&times;</button>
        </div>
      }
    </div>
  `
})
export class ChatComponent {
  messages = signal<Message[]>([]);
  newMessage = signal<string>('');
  isLoading = signal<boolean>(false);
  error = signal<string>('');

  private chatService = inject(ChatService);
  private sanitizer = inject(DomSanitizer);

  constructor() {
    // Load chat history from service
    this.messages.set(this.chatService.getMessages());

    // Configure marked options
    marked.setOptions({
      breaks: true,
      gfm: true
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

    // Scroll to bottom
    setTimeout(() => this.scrollToBottom(), 100);

    // Get AI response
    this.chatService.sendMessage(messageText).subscribe({
      next: (response) => {
        const aiMessage: Message = {
          id: this.generateId(),
          sender: 'ai',
          text: response,
          timestamp: new Date()
        };
        this.messages.update(msgs => [...msgs, aiMessage]);
        this.isLoading.set(false);
        setTimeout(() => this.scrollToBottom(), 100);
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
        setTimeout(() => this.scrollToBottom(), 100);
      }
    });
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

  private getErrorMessage(error: any): string {
    if (error.status === 0) {
      return 'Network error. Please check your connection.';
    }
    if (error.status === 401) {
      return 'API key invalid or missing. Please check your configuration.';
    }
    if (error.status === 429) {
      return 'Rate limit exceeded. Please try again later.';
    }
    if (error.error?.error?.message) {
      return error.error.error.message;
    }
    return error.message || 'An unexpected error occurred.';
  }

  private scrollToBottom(): void {
    const messagesContainer = document.querySelector('.messages');
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }
}
