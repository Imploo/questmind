import { Component, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-character-draft-preview',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule],
  template: `
    <div class="w-full">
      <mat-card class="rounded-lg overflow-hidden">
      <mat-card-content class="p-4 bg-amber-500">
          <div class="flex items-start gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <div class="flex-1">
              <h3 class="font-bold">Changes Proposed</h3>
              <div class="text-xs">The Sidekick has suggested updates to your character.</div>
            </div>
            <div class="flex gap-2">
              <button mat-button (click)="dismiss.emit()">Dismiss</button>
              <button mat-raised-button color="primary" (click)="commit.emit()">Update Character</button>
            </div>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `
})
export class CharacterDraftPreviewComponent {
  commit = output<void>();
  dismiss = output<void>();
}
