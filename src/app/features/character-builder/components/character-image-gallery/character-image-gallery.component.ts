import { Component, input, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImageLightboxComponent } from '../../../../chat/image-lightbox.component';

export interface CharacterImage {
  url: string;
  mimeType: string;
  createdAt?: string;
}

@Component({
  selector: 'app-character-image-gallery',
  standalone: true,
  imports: [CommonModule, ImageLightboxComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (lightboxUrl()) {
      <app-image-lightbox [url]="lightboxUrl()!" (closed)="closeLightbox()" />
    }

    <div class="card bg-base-100 shadow-sm border border-base-200">
      <div class="card-body p-4">
        <h3 class="card-title text-sm uppercase tracking-wider border-b pb-2 mb-3">Afbeeldingen Galerij</h3>
        
        @if (images().length === 0) {
          <div class="text-center py-8 text-sm opacity-60">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p>Nog geen afbeeldingen</p>
            <p class="text-xs mt-1">Genereer afbeeldingen via de chat met 🎨</p>
          </div>
        } @else {
          <div class="grid grid-cols-2 gap-3">
            @for (image of images(); track image.url) {
              <div 
                class="relative group cursor-pointer overflow-hidden rounded-lg border border-base-300 hover:border-primary transition-all duration-200 shadow-sm hover:shadow-md"
                (click)="openLightbox(image.url)"
              >
                <img
                  [src]="image.url"
                  [alt]="'Karakter afbeelding ' + ($index + 1)"
                  class="w-full h-40 object-cover transition-transform duration-200 group-hover:scale-105"
                  loading="lazy"
                />
                <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    class="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                  </svg>
                </div>
                @if (image.createdAt) {
                  <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                    <span class="text-xs text-white opacity-90">{{ formatDate(image.createdAt) }}</span>
                  </div>
                }
              </div>
            }
          </div>
          
          <div class="mt-3 text-xs text-center opacity-60">
            {{ images().length }} {{ images().length === 1 ? 'afbeelding' : 'afbeeldingen' }}
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class CharacterImageGalleryComponent {
  images = input.required<CharacterImage[]>();
  lightboxUrl = signal<string | null>(null);

  openLightbox(url: string): void {
    this.lightboxUrl.set(url);
  }

  closeLightbox(): void {
    this.lightboxUrl.set(null);
  }

  formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('nl-NL', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      }).format(date);
    } catch {
      return dateString;
    }
  }
}
