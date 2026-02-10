import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-image-lightbox',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 cursor-zoom-out"
      (click)="close.emit()"
    >
      <img
        [src]="url()"
        alt="Vergroot afbeelding"
        class="max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl"
        (click)="$event.stopPropagation()"
      />
      <button
        class="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center text-2xl leading-none hover:bg-black/80 transition-colors"
        (click)="close.emit()"
      >&times;</button>
    </div>
  `,
})
export class ImageLightboxComponent {
  url = input.required<string>();
  close = output<void>();
}
