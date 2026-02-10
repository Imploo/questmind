import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CharacterVersion } from '../../../../core/models/schemas/character.schema';

@Component({
  selector: 'app-character-version-history',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed inset-0 bg-black/50 z-50 flex justify-end" (click)="closed.emit()">
      <div class="w-96 bg-base-100 h-full shadow-xl overflow-y-auto p-6" (click)="$event.stopPropagation()">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-xl font-bold">Version History</h2>
          <button class="btn btn-circle btn-ghost btn-sm" (click)="closed.emit()">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div class="space-y-4">
          @for (version of versions(); track version.id) {
            <div class="card bg-base-200 border border-base-300">
              <div class="card-body p-4">
                <div class="flex justify-between items-start">
                  <h3 class="font-bold">Version {{ version.versionNumber }}</h3>
                  @if (version.id === activeVersionId()) {
                    <span class="badge badge-primary badge-sm">Active</span>
                  }
                </div>
                <p class="text-sm opacity-70">{{ version.commitMessage }}</p>
                <div class="text-xs opacity-50 mt-2">
                  {{ version.createdAt.toDate() | date:'medium' }} • {{ version.source }}
                </div>
                
                @if (version.id !== activeVersionId()) {
                  <div class="card-actions justify-end mt-2">
                    <button class="btn btn-xs btn-outline" (click)="restore.emit(version)">
                      Restore
                    </button>
                  </div>
                }
              </div>
            </div>
          } @empty {
            <div class="text-center opacity-50">No history available.</div>
          }
        </div>
      </div>
    </div>
  `
})
export class CharacterVersionHistoryComponent {
  versions = input.required<CharacterVersion[]>();
  activeVersionId = input.required<string>();
  
  closed = output<void>();
  restore = output<CharacterVersion>();
}
