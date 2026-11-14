import { ChangeDetectionStrategy, Component, output, input } from '@angular/core';

@Component({
  selector: 'app-character-draft-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="draft" role="status">
      <!-- What it is and what you can do with it; on a narrow banner the buttons take a row of their own. -->
      <div class="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span class="qm-medallion qm-medallion-brand hidden @md:inline-flex">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
        </span>
        <div class="min-w-0 flex-1">
          <div class="qm-eyebrow">Draft</div>
          <h3 class="qm-display text-base leading-snug">Changes Proposed</h3>
        </div>
        <div class="flex basis-full gap-2 @md:basis-auto">
          <button type="button" class="qm-btn qm-btn-ghost" (click)="dismiss.emit()" [disabled]="loading()">Dismiss</button>
          <button type="button" class="qm-btn qm-btn-primary flex-1 @md:flex-none" (click)="commit.emit()" [disabled]="loading()">
            @if (loading()) {
              <span class="qm-spinner qm-spinner-light" aria-hidden="true"></span>
            }
            {{ loading() ? 'Saving...' : 'Update Character' }}
          </button>
        </div>
      </div>

      <!-- The explanation gets the full width, below the buttons. -->
      <div class="mt-3 border-t border-gold/30 pt-3">
        <p class="text-sm text-gray-700">The Sidekick has suggested updates to your character.</p>
        @if (abilityScoreWarnings().length) {
          <div class="qm-alert mt-3 text-xs" role="alert">
            <div class="font-semibold">Ability scores don't follow the rules:</div>
            <ul class="list-disc ml-4 mt-1">
              @for (warning of abilityScoreWarnings(); track $index) {
                <li>{{ warning }}</li>
              }
            </ul>
            <div class="mt-1">Ask the Sidekick in the chat to fix this before updating.</div>
          </div>
        }
        @if (derivedStatCorrections().length) {
          <details class="mt-2 text-xs text-gray-700">
            <summary class="font-semibold">
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
    </div>
  `,
  styles: [`
    /* The banner is as wide as the sheet's column, which can be narrow on a wide screen too. */
    :host { display: block; container-type: inline-size; }

    /* A proposal lying on top of the sheet: gold-edged, so it reads as not yet part of it. */
    .draft {
      padding: 1rem 1.1rem;
      border-radius: 14px;
      color: var(--ink);
      background: linear-gradient(180deg, #fffaf0, var(--gold-soft));
      border: 1px solid var(--gold);
      box-shadow: var(--float-shadow);
    }
  `]
})
export class CharacterDraftPreviewComponent {
  loading = input<boolean>(false);
  abilityScoreWarnings = input<string[]>([]);
  derivedStatCorrections = input<string[]>([]);
  commit = output<void>();
  dismiss = output<void>();
}
