import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-image-lightbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,12,44,0.88)] backdrop-blur-sm cursor-zoom-out"
      (click)="closed.emit()"
    >
      <img
        [src]="url()"
        alt="Vergroot afbeelding"
        class="max-h-[90vh] max-w-[90vw] rounded-xl border-4 border-paper shadow-2xl"
        (click)="$event.stopPropagation()"
      />
      <button
        type="button"
        aria-label="Sluiten"
        class="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center text-2xl leading-none hover:bg-black/80 transition-colors"
        (click)="closed.emit()"
      >&times;</button>
    </div>
  `,
})
export class ImageLightboxComponent {
  url = input.required<string>();
  closed = output<void>();
}
