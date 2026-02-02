import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-loading',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
      <div class="text-center">
        <div class="inline-block w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4"></div>
        <h2 class="text-white text-xl font-semibold">Loading Questmind...</h2>
      </div>
    </div>
  `,
  styles: [`
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .animate-spin {
      animation: spin 1s linear infinite;
    }
  `]
})
export class LoadingComponent {}
