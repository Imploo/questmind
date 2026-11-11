import { ChangeDetectionStrategy, Component, output, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-character-draft-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule, MatButtonModule, MatProgressSpinnerModule],
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
              @if (abilityScoreWarnings().length) {
                <div class="mt-2 text-xs" role="alert">
                  <div class="font-semibold">Ability scores don't follow the rules:</div>
                  <ul class="list-disc ml-4">
                    @for (warning of abilityScoreWarnings(); track $index) {
                      <li>{{ warning }}</li>
                    }
                  </ul>
                  <div class="mt-1">Ask the Sidekick in the chat to fix this before updating.</div>
                </div>
              }
              @if (derivedStatCorrections().length) {
                <details class="mt-2 text-xs">
                  <summary class="cursor-pointer font-semibold">
                    {{ derivedStatCorrections().length }} value(s) recalculated from the ability scores
                  </summary>
                  <ul class="list-disc ml-4 mt-1">
                    @for (correction of derivedStatCorrections(); track $index) {
                      <li>{{ correction }}</li>
                    }
                  </ul>
                </details>
              }
            </div>
            <div class="flex flex-col-reverse gap-2">
              <button mat-button (click)="dismiss.emit()" [disabled]="loading()">Dismiss</button>
              <button mat-raised-button color="primary" (click)="commit.emit()" [disabled]="loading()">
                @if (loading()) {
                  <mat-spinner diameter="20" class="inline-block mr-2"></mat-spinner>
                }
                {{ loading() ? 'Saving...' : 'Update Character' }}
              </button>
            </div>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `
})
export class CharacterDraftPreviewComponent {
  loading = input<boolean>(false);
  abilityScoreWarnings = input<string[]>([]);
  derivedStatCorrections = input<string[]>([]);
  commit = output<void>();
  dismiss = output<void>();
}
