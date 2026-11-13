import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
  NgZone,
} from '@angular/core';
import { ChatComponent } from '../../../../chat/chat.component';
import { DndCharacter } from '../../../../shared/models/dnd-character.model';
import { ChatAttachment } from '../../../../shared/utils/build-character-context';

/** Collapsed, the drawer is a bar with the handle and its label. */
const COLLAPSED_PX = 60;
const EXPANDED_VH = 0.82;
const DRAG_THRESHOLD_PX = 40;

@Component({
  selector: 'app-chat-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChatComponent],
  host: {
    class: 'fixed bottom-0 left-0 right-0 z-30 flex flex-col overflow-hidden rounded-t-2xl border-t border-gold/40 bg-paper shadow-[0_-10px_32px_-8px_rgba(24,12,60,0.55)]',
    '[style.height]': 'drawerHeight()',
    '[style.transition]': 'isDragging() ? "none" : "height 300ms ease-out"',
  },
  template: `
    <button
      type="button"
      class="flex w-full shrink-0 flex-col items-center justify-center gap-1.5 select-none touch-none"
      [style.height.px]="isExpanded() || isDragging() ? 32 : 60"
      [attr.aria-expanded]="isExpanded()"
      aria-label="Chat met The Sidekick"
      (pointerdown)="onPointerDown($event)"
      (click)="onHandleClick()"
    >
      <span class="h-1.5 w-12 rounded-full bg-gold/60"></span>
      @if (!isExpanded() && !isDragging()) {
        <span class="flex items-center gap-2 pb-1 font-display text-xs font-bold tracking-[0.1em] text-ink">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-primary-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
          Ask The Sidekick
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 15l7-7 7 7" /></svg>
        </span>
      }
    </button>
    <div class="flex flex-1 flex-col overflow-hidden" [class.invisible]="!isExpanded() && !isDragging()">
      @if (character()) {
        <app-chat #chatComp [character]="character()!" (viewVersions)="viewVersions.emit()"></app-chat>
      } @else {
        <div class="flex h-full items-center justify-center text-sm qm-muted">
          Selecteer een character om te chatten
        </div>
      }
    </div>
  `
})
export class ChatDrawerComponent {
  character = input<DndCharacter | null>(null);

  /** The user asks for the version history from the chat. */
  viewVersions = output<void>();

  isExpanded = signal(false);
  isDragging = signal(false);

  private dragStartY = 0;
  private dragStartExpanded = false;
  private currentDragDelta = signal(0);
  private didDrag = false;

  private chatComp = viewChild<ChatComponent>('chatComp');
  private zone = inject(NgZone);

  drawerHeight = computed(() => {
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const collapsedPx = COLLAPSED_PX;
    const expandedPx = vh * EXPANDED_VH;

    if (this.isDragging()) {
      const base = this.dragStartExpanded ? expandedPx : collapsedPx;
      const delta = this.currentDragDelta();
      const newHeight = Math.min(Math.max(base - delta, collapsedPx), expandedPx);
      return `${newHeight}px`;
    }

    return this.isExpanded() ? `${expandedPx}px` : `${collapsedPx}px`;
  });

  expand(): void {
    this.isExpanded.set(true);
  }

  focusChat(): void {
    // After the next render: collapsed, the chat is hidden and cannot take focus yet.
    setTimeout(() => this.chatComp()?.focusInput());
  }

  /** Open the drawer and send a PDF to the chat. Returns false while the chat is not there yet. */
  sendAttachment(attachment: ChatAttachment): boolean {
    const chat = this.chatComp();
    if (!chat) return false;
    this.expand();
    chat.sendAttachment(attachment);
    return true;
  }

  onHandleClick(): void {
    if (!this.didDrag) {
      this.isExpanded.update(v => !v);
    }
  }

  onPointerDown(event: PointerEvent): void {
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    this.dragStartY = event.clientY;
    this.dragStartExpanded = this.isExpanded();
    this.didDrag = false;
    this.currentDragDelta.set(0);

    const onMove = (e: PointerEvent) => {
      const delta = e.clientY - this.dragStartY;
      if (!this.isDragging() && Math.abs(delta) > 8) {
        this.zone.run(() => this.isDragging.set(true));
        this.didDrag = true;
      }
      if (this.isDragging()) {
        this.zone.run(() => this.currentDragDelta.set(delta));
      }
    };

    const onUp = (e: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      const delta = e.clientY - this.dragStartY;

      this.zone.run(() => {
        this.isDragging.set(false);
        this.currentDragDelta.set(0);

        if (Math.abs(delta) >= DRAG_THRESHOLD_PX) {
          this.isExpanded.set(delta < 0);
        }
      });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }
}
