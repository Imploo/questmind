import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** One character in the character list: portrait, name and build, opened with a click. */
@Component({
  selector: 'app-character-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block border border-white/20 aspect-square rounded-2xl overflow-hidden cursor-pointer shadow-md hover:shadow-xl transition-all duration-200 hover:-translate-y-1 hover:scale-[1.02] relative group',
    '(click)': 'opened.emit()',
  },
  template: `
    @if (imageUrl()) {
      <!-- Tile with image -->
      <img
        [src]="imageUrl()"
        [alt]="name()"
        class="absolute inset-0 w-full h-full object-cover"
        [class.grayscale]="archived()"
      />
      <div class="absolute inset-0 bg-white/20"></div>
    } @else {
      <!-- Glassy tile without image -->
      <div class="absolute inset-0 bg-base-300/40 backdrop-blur-md border border-white/20"></div>
      <div class="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"></div>
    }

    @if (archived()) {
      <!-- An archived character comes back to the list with one click -->
      <button
        type="button"
        class="absolute top-2 right-2 inline-flex items-center gap-1.5 min-h-8 px-2.5 rounded-full bg-white/90 text-gray-700 text-xs font-medium shadow-sm border border-gray-200 hover:bg-white cursor-pointer"
        [attr.aria-label]="'Unarchive ' + name()"
        (click)="$event.stopPropagation(); restored.emit()"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-7 9v-5m0 0l-2 2m2-2l2 2" /></svg>
        Unarchive
      </button>
    }

    <!-- Bottom 1/3 overlay for contrast -->
    <div class="absolute bottom-0 left-0 right-0 h-1/3 bg-black/40 backdrop-blur-[2px]"></div>

    <!-- Content overlay — pinned to bottom -->
    <div class="absolute bottom-0 left-0 right-0 px-2.5 pb-2">
      <p class="text-[12px] font-medium leading-none !mb-2 text-white/80 drop-shadow-sm">{{ name() }}</p>
      <p class="text-[10px] leading-none !mb-2 text-white/50">{{ subtitle() }}</p>
    </div>
  `
})
export class CharacterTileComponent {
  name = input.required<string>();
  subtitle = input('');
  imageUrl = input<string | null>(null);
  /** An archived tile is greyed out and offers to bring the character back. */
  archived = input(false);
  opened = output<void>();
  restored = output<void>();
}
