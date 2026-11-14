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

    <div
      class="chat relative flex flex-col h-full overflow-hidden bg-paper text-ink"
      [class.is-floating]="floating()"
      [style.--dock-height]="floating() ? dockHeight() + 'px' : null"
    >
      <div class="chat-head">
        <button
          type="button"
          class="head-btn"
          aria-label="Eerdere gesprekken"
          title="Eerdere gesprekken"
          (click)="historyOpen.set(true)"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l4 2" />
          </svg>
        </button>
        @if (!floating()) {
          <div class="min-w-0 flex-1 text-center">
            <div class="font-display text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-white/75">The Sidekick</div>
            <h2 class="truncate font-display text-sm font-bold leading-tight">{{ title() }}</h2>
          </div>
        }
        <button
          type="button"
          class="head-btn"
          aria-label="Nieuw gesprek"
          title="Nieuw gesprek"
          (click)="startNewChat()"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12.4 14.6 8 16l1.4-4.4z" />
          </svg>
        </button>
      </div>

      @if (floating()) {
        <!-- The messages scroll on behind the floating buttons and the composer, fading out. -->
        <div class="fade fade-top" aria-hidden="true"></div>
        <div class="fade fade-bottom" aria-hidden="true"></div>
      }

      <div class="messages flex-1 overflow-y-auto flex flex-col gap-3 bg-paper-2 scrollbar-thin" #messagesContainer>
        @if (messages().length === 0) {
          <div class="m-auto px-2 text-center">
            <span class="qm-medallion mx-auto">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </span>
            <p class="mt-3 font-display text-sm font-bold">Ask about your character!</p>
            <p class="mt-1 font-prose text-base italic text-gray-600">Try: "Change my class to Rogue"</p>
          </div>
        }

        @if (hasEarlierMessages()) {
          <button type="button" class="qm-btn qm-btn-sm self-center" (click)="loadEarlierMessages()">Eerdere berichten laden</button>
        }

        @for (row of rows(); track row.message.id) {
          @let message = row.message;
          @if (row.dayLabel) {
            <div class="day">{{ row.dayLabel }}</div>
          }
          @if (message.sender === 'system') {
            <div class="bubble is-system animate-slide-in">
              <div class="flex items-center gap-2">
                @if (message.isUpdatingCharacter) {
                  <div class="flex gap-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-gold animate-bounce-dot"></span>
                    <span class="w-1.5 h-1.5 rounded-full bg-gold animate-bounce-dot [animation-delay:-0.16s]"></span>
                    <span class="w-1.5 h-1.5 rounded-full bg-gold animate-bounce-dot [animation-delay:-0.32s]"></span>
                  </div>
                } @else {
                  <span class="h-1.5 w-1.5 shrink-0 rotate-45 bg-gold" aria-hidden="true"></span>
                }
                <span>{{ message.text }}</span>
                @if (message.versionNumber) {
                  <button
                    type="button"
                    (click)="viewVersions.emit()"
                    class="shrink-0 text-xs font-semibold underline underline-offset-2 hover:no-underline"
                    title="Versiegeschiedenis openen"
                  >versie {{ message.versionNumber }}</button>
                }
                @if (message.isUpdatingCharacter) {
                  <button
                    type="button"
                    (click)="cancelCharacterUpdate(message.id)"
                    class="ml-auto shrink-0 text-xs underline underline-offset-2 hover:no-underline"
                  >Annuleren</button>
                }
              </div>
            </div>
          } @else if (message.text || message.images?.length || message.pdfFileName) {
            <div
              class="bubble animate-slide-in"
              [class.is-user]="message.sender === 'user'"
              [class.is-error]="message.sender === 'error'"
            >
              <div class="bubble-meta">
                <span>{{ message.sender === 'user' ? 'You' : 'The Sidekick' }}</span>
                <span class="time">{{ formatTime(message.timestamp) }}</span>
              </div>
              <div class="leading-relaxed">
                @if (message.pdfFileName) {
                  <div class="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-md"
                    [class]="message.sender === 'user' ? 'bg-white/15' : 'bg-paper-2'">
                    <svg class="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"/>
                    </svg>
                    <span class="text-xs truncate">{{ message.pdfFileName }}</span>
                  </div>
                }
                @if (message.sender === 'user') {
                  <p class="m-0 whitespace-pre-wrap break-words">{{ message.text }}</p>
                } @else {
                  <div class="prose prose-sm qm-prose-chat max-w-none" [innerHTML]="parseMarkdown(message.text)"></div>
                }

                @if (message.images && message.images.length > 0) {
                  <div class="mt-3 flex flex-col gap-2">
                    @for (image of message.images; track $index) {
                      <img
                        [src]="image.url"
                        [alt]="'Generated image ' + ($index + 1)"
                        class="max-w-full rounded-lg border border-line cursor-zoom-in hover:opacity-90 transition-opacity"
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
          <div class="bubble animate-slide-in" role="status" aria-label="The Sidekick is typing">
            <div class="flex gap-1 py-1">
              <span class="w-1.5 h-1.5 rounded-full bg-primary animate-bounce-dot"></span>
              <span class="w-1.5 h-1.5 rounded-full bg-primary animate-bounce-dot [animation-delay:-0.16s]"></span>
              <span class="w-1.5 h-1.5 rounded-full bg-primary animate-bounce-dot [animation-delay:-0.32s]"></span>
            </div>
          </div>
        }
      </div>

      <div class="dock" #dock>
      <div class="dock-card"
        (dragover)="onDragOver($event)"
        (dragleave)="onDragLeave($event)"
        (drop)="onDrop($event)"
        [class.ring-2]="isDragOver()"
        [class.ring-primary]="isDragOver()"
        [class.ring-inset]="isDragOver()"
        [class.is-image]="isImageMode()"
        [class.is-busy]="isLoading()"
      >
        @if (isImageMode()) {
          <div class="flex flex-wrap items-center gap-2 px-3 pt-3 pb-1">
            <span class="qm-badge qm-badge-violet">
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <span>Afbeelding genereren</span>
            </span>
            <span class="text-xs qm-muted">Stuurt naar Gemini beeldgenerator</span>
          </div>
        }
        @if (pendingAttachment()) {
          <div class="flex items-center gap-2 px-3 pt-3 pb-1">
            <span class="qm-badge qm-badge-info !pr-1">
              <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"/>
              </svg>
              <span class="truncate max-w-[180px]">{{ pendingAttachment()!.fileName }}</span>
              <button type="button" (click)="removeAttachment()" aria-label="Bijlage verwijderen" class="flex items-center justify-center w-4 h-4 rounded-full hover:bg-primary/20 transition-colors">
                <svg class="w-3 h-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
                </svg>
              </button>
            </span>
          </div>
        }
        @if (isDragOver()) {
          <div class="flex items-center justify-center gap-2 px-4 py-3 text-sm text-primary-dark font-medium">
            <svg class="w-5 h-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
            </svg>
            <span>Drop PDF here</span>
          </div>
        }
        <div class="composer-row" [class.has-chip]="isImageMode() || pendingAttachment()">
          <div class="composer" [class.is-image]="isImageMode()" [class.is-busy]="isLoading()">
            <div class="composer-plus relative">
              <button
                type="button"
                (click)="toggleActionMenu($event)"
                [disabled]="isLoading()"
                aria-label="Meer acties"
                [attr.aria-expanded]="showActionMenu()"
                class="plus-btn flex items-center justify-center w-8 h-8 ml-1 rounded-md text-gray-500 hover:text-ink hover:bg-paper-2 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg class="w-4 h-4 transition-transform duration-150" [class.rotate-45]="showActionMenu()" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"/>
                </svg>
              </button>
              @if (showActionMenu()) {
                <div class="qm-menu absolute bottom-full left-0 mb-2 w-52 z-10">
                  <button type="button" class="qm-menu-item" (click)="openPdfPicker()">
                    <svg class="w-4 h-4 text-primary-dark" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"/>
                    </svg>
                    <span>Import PDF</span>
                  </button>
                  <button type="button" class="qm-menu-item" (click)="insertAction('maak afbeelding')">
                    <svg class="w-4 h-4 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
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
              aria-label="Bericht"
              class="composer-input min-w-0 flex-1 px-2 py-2 text-sm bg-transparent border-none outline-none placeholder:text-gray-400 disabled:cursor-not-allowed"
            />
          </div>
          <button
            type="button"
            (click)="sendMessage()"
            [disabled]="isLoading() || (!newMessage().trim() && !pendingAttachment())"
            class="send qm-btn qm-btn-primary"
            [attr.aria-label]="isImageMode() ? 'Afbeelding genereren' : floating() ? 'Verstuur' : null"
          >
            @if (isLoading()) {
              <span class="qm-spinner qm-spinner-light" aria-hidden="true"></span>
            } @else if (isImageMode()) {
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
            } @else if (floating()) {
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
            } @else {
              Send
            }
          </button>
        </div>
      </div>

      @if (error()) {
        <div class="dock-alert qm-alert flex items-center justify-between animate-slide-in" role="alert">
          <span class="flex-1">{{ error() }}</span>
          <button type="button" (click)="clearError()" aria-label="Sluiten" class="ml-2 w-5 h-5 text-xl leading-none hover:opacity-70">&times;</button>
        </div>
      }
      </div>

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
  `,
  styles: [`
    /* The Sidekick speaks from the brand gradient; so do you. */
    .chat-head {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.55rem 0.6rem;
      color: #fff;
      background: var(--brand-gradient);
      box-shadow: inset 0 -1px 0 rgba(229, 199, 127, 0.55);
    }
    .head-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 2rem;
      height: 2rem;
      border-radius: 9px;
      flex-shrink: 0;
      color: #fff;
      background: rgba(255, 255, 255, 0.18);
      transition: background 0.15s;
    }
    .head-btn:hover { background: rgba(255, 255, 255, 0.32); }

    .day {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      font-family: var(--font-display);
      font-size: 0.62rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .day::before, .day::after { content: ''; flex: 1; height: 1px; background: #e0d2b6; }

    .bubble {
      align-self: flex-start;
      max-width: 88%;
      padding: 0.65rem 0.8rem;
      border-radius: 12px 12px 12px 3px;
      font-size: 0.875rem;
      color: var(--ink);
      background: var(--paper);
      border: 1px solid var(--line);
      box-shadow: 0 2px 8px -6px rgba(60, 40, 10, 0.35);
    }
    .bubble.is-user {
      align-self: flex-end;
      border-radius: 12px 12px 3px 12px;
      color: #fff;
      background: var(--brand-gradient);
      border-color: transparent;
      box-shadow: 0 6px 14px -10px rgba(60, 36, 150, 0.9);
    }
    .bubble.is-error { color: #7c2630; background: #fbefed; border-color: #e6bfc0; }
    .bubble.is-system {
      padding: 0.45rem 0.75rem;
      border-radius: 999px;
      font-size: 0.8rem;
      color: #62480f;
      background: var(--gold-soft);
      border-color: rgba(180, 138, 60, 0.45);
      box-shadow: none;
    }
    .bubble-meta {
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      margin-bottom: 0.3rem;
      font-family: var(--font-display);
      font-size: 0.62rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--gold-deep);
    }
    .bubble.is-user .bubble-meta { color: rgba(255, 255, 255, 0.85); }
    .bubble.is-error .bubble-meta { color: inherit; }
    .time { font-family: var(--font-sans); font-weight: 500; letter-spacing: 0; opacity: 0.8; }

    /* The messages, and under them the dock: the composer with a possible error below it. */
    .messages { padding: 1rem; }
    .dock-card { border-top: 1px solid var(--line); background: var(--paper); }
    .dock-alert { margin: 0 0.75rem 0.75rem; }
    .composer-row { display: flex; gap: 0.5rem; padding: 0.75rem; }
    .composer-row.has-chip { padding-top: 0.5rem; }

    .composer {
      position: relative;
      display: flex;
      flex: 1;
      align-items: center;
      min-width: 0;
      border-radius: 10px;
      background: #fff;
      border: 1px solid #d9c9a6;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .composer:focus-within { border-color: var(--color-primary); box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.22); }
    .composer.is-image { border-color: var(--color-secondary); }
    .composer.is-image:focus-within { box-shadow: 0 0 0 3px rgba(118, 75, 162, 0.22); }
    .composer.is-busy { background: var(--paper-2); }

    /*
     * Floating: the chat fills a whole panel on a phone. No header and no footer; the two
     * header buttons and the composer float over the messages instead.
     */
    .is-floating .chat-head {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      z-index: 6;
      justify-content: space-between;
      padding: 0.75rem;
      background: none;
      box-shadow: none;
      pointer-events: none;
    }
    .is-floating .head-btn {
      width: 2.75rem;
      height: 2.75rem;
      border-radius: 50%;
      color: #4d4339;
      background: #fff;
      border: 1px solid var(--line);
      box-shadow: 0 1px 2px rgba(30, 20, 60, 0.08), 0 8px 20px -8px rgba(30, 16, 70, 0.4);
      pointer-events: auto;
    }
    .is-floating .head-btn:hover { background: var(--paper-2); }

    .is-floating .messages {
      padding-top: 4.25rem;
      padding-bottom: calc(var(--dock-height, 6.75rem) + 1.75rem + env(safe-area-inset-bottom, 0px));
    }
    .fade {
      position: absolute;
      left: 0;
      right: 0;
      z-index: 5;
      pointer-events: none;
    }
    .fade-top {
      top: 0;
      height: 4.75rem;
      background: linear-gradient(to top, rgb(248 242 230 / 0), rgb(248 242 230 / 0.95) 70%);
    }
    .fade-bottom {
      bottom: 0;
      height: calc(var(--dock-height, 6.75rem) + 3rem + env(safe-area-inset-bottom, 0px));
      background: linear-gradient(to bottom, rgb(248 242 230 / 0), rgb(248 242 230 / 0.95) 55%);
    }

    .is-floating .dock {
      position: absolute;
      left: 0.75rem;
      right: 0.75rem;
      bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
      z-index: 6;
      display: flex;
      flex-direction: column-reverse;
      gap: 0.5rem;
    }
    .is-floating .dock-alert { margin: 0; box-shadow: 0 8px 20px -8px rgba(30, 16, 70, 0.4); }
    .is-floating .dock-card {
      border: 1px solid var(--line);
      border-radius: 1.5rem;
      background: #fff;
      box-shadow: 0 1px 2px rgba(30, 20, 60, 0.08), 0 12px 30px -10px rgba(30, 16, 70, 0.4);
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .is-floating .dock-card:focus-within {
      border-color: var(--color-primary);
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.22), 0 12px 30px -10px rgba(30, 16, 70, 0.4);
    }
    .is-floating .dock-card.is-image { border-color: var(--color-secondary); }
    .is-floating .dock-card.is-busy { background: var(--paper-2); }

    /* The field on top, the two round buttons in the corners below it. */
    .is-floating .composer-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      grid-template-areas: "input input input" "plus . send";
      row-gap: 0.25rem;
      padding: 0.5rem;
    }
    .is-floating .composer { display: contents; }
    .is-floating .composer-plus { grid-area: plus; }
    /* 16px keeps iOS from zooming in when the field takes the focus. */
    .is-floating .composer-input { grid-area: input; padding: 0.55rem 0.5rem; font-size: 1rem; line-height: 1.375rem; }
    .is-floating .plus-btn {
      width: 2.75rem;
      height: 2.75rem;
      margin: 0;
      border-radius: 50%;
      color: #5f5347;
      background: var(--paper-2);
      border: 1px solid var(--line);
    }
    .is-floating .send {
      grid-area: send;
      width: 2.75rem;
      min-height: 2.75rem;
      padding: 0;
      border-radius: 50%;
    }
  `]
})
export class ChatComponent {
  // Optional character input - when provided, enables character-aware mode
  character = input<DndCharacter | null>(null);

  /**
   * The chat fills a panel of its own on a phone: no header and no footer, the header
   * buttons and the composer float over the messages.
   */
  floating = input(false);

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
  private dock = viewChild<ElementRef<HTMLElement>>('dock');
  /** Height of the floating composer, so the last message can scroll clear of it. */
  dockHeight = signal(108);
  /** The newest message is in view: keep it there when the room for the messages changes. */
  private stickToBottom = true;
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

    // A keyboard that opens, or a composer that grows, takes room away from the messages:
    // whoever was reading the newest message keeps it in view.
    effect(onCleanup => {
      const container = this.messagesContainer()?.nativeElement;
      const dock = this.dock()?.nativeElement;
      if (!container || !dock || typeof ResizeObserver === 'undefined') {
        return;
      }
      const onScroll = () => {
        this.stickToBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 48;
      };
      const observer = new ResizeObserver(() => {
        this.dockHeight.set(Math.round(dock.offsetHeight));
        if (this.stickToBottom) {
          this.scrollToBottom(container);
        }
      });
      container.addEventListener('scroll', onScroll, { passive: true });
      observer.observe(container);
      observer.observe(dock);
      onCleanup(() => {
        container.removeEventListener('scroll', onScroll);
        observer.disconnect();
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
    // The chat can be the panel that is off screen: getting there is the caller's job.
    input.nativeElement.focus({ preventScroll: true });
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
