import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  viewChild,
  NgZone,
} from '@angular/core';
import { ChatComponent } from '../../../../chat/chat.component';
import { DndCharacter } from '../../../../shared/schemas/dnd-character.schema';

const COLLAPSED_VH = 0.10;
const EXPANDED_VH = 0.82;
const DRAG_THRESHOLD_PX = 40;

@Component({
  selector: 'app-chat-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChatComponent],
  host: {
    class: 'fixed bottom-0 left-0 right-0 z-30 flex flex-col rounded-t-2xl bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.18)]',
    '[style.height]': 'drawerHeight()',
    '[style.transition]': 'isDragging() ? "none" : "height 300ms ease-out"',
  },
  template: `
    <div
      class="flex shrink-0 cursor-pointer flex-col items-center pb-2 pt-3 select-none touch-none"
      (pointerdown)="onPointerDown($event)"
      (click)="onHandleClick()"
    >
      <div class="h-1.5 w-12 rounded-full bg-gray-300"></div>
    </div>
    <div class="flex flex-1 flex-col overflow-hidden px-4 pb-4">
      @if (character()) {
        <app-chat #chatComp [character]="character()!"></app-chat>
      } @else {
        <div class="flex h-full items-center justify-center text-sm opacity-60">
          Selecteer een character om te chatten
        </div>
      }
    </div>
  `
})
export class ChatDrawerComponent {
  character = input<DndCharacter | null>(null);

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
    const collapsedPx = vh * COLLAPSED_VH;
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
    this.chatComp()?.focusInput();
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
