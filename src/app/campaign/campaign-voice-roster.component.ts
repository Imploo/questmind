import { ChangeDetectionStrategy, Component, computed, effect, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '../core/i18n/translate.pipe';

/** Maximum length of the speaking order — mirrors the backend prompt cap. */
export const VOICE_ROSTER_MAX_LENGTH = 2000;

/**
 * Presentational component for the voice intro speaking order: a free-text
 * description of who speaks in which order in the introduction recording, so the
 * AI does not have to pick up every name by ear.
 */
@Component({
  selector: 'app-campaign-voice-roster',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
  template: `
    <div class="qm-well mt-3">
      <label for="voice-roster" class="qm-label">
        {{ 'campaign.voiceRoster.label' | translate }}
      </label>
      <p id="voice-roster-help" class="qm-help mb-2">
        {{ 'campaign.voiceRoster.help' | translate }}
      </p>

      @if (canEdit()) {
        <textarea
          id="voice-roster"
          rows="5"
          aria-describedby="voice-roster-help"
          [attr.maxlength]="maxLength"
          [formControl]="rosterControl"
          [placeholder]="'campaign.voiceRoster.placeholder' | translate"
          class="qm-input !text-sm"
        ></textarea>
        <div class="mt-2 flex items-center gap-3">
          <button
            type="button"
            (click)="save()"
            [disabled]="!isDirty() || isBusy()"
            class="qm-btn qm-btn-gold"
          >
            {{ (isBusy() ? 'campaign.saving' : 'campaign.voiceRoster.save') | translate }}
          </button>
          <span class="text-xs qm-muted tabular-nums">{{ length() }} / {{ maxLength }}</span>
        </div>
      } @else if (roster()) {
        <p id="voice-roster" class="text-sm whitespace-pre-line">{{ roster() }}</p>
      } @else {
        <p id="voice-roster" class="text-sm qm-muted">{{ 'campaign.voiceRoster.empty' | translate }}</p>
      }

      <div aria-live="polite">
        @if (errorMessage()) {
          <p class="mt-2 text-sm text-wine">{{ errorMessage() }}</p>
        }
      </div>
    </div>
  `
})
export class CampaignVoiceRosterComponent {
  readonly roster = input('');
  readonly canEdit = input(false);
  readonly isBusy = input(false);
  readonly errorMessage = input('');

  readonly rosterSaved = output<string>();

  readonly maxLength = VOICE_ROSTER_MAX_LENGTH;

  readonly rosterControl = new FormControl('', { nonNullable: true });
  private readonly draft = toSignal(this.rosterControl.valueChanges, { initialValue: '' });

  readonly length = computed(() => this.draft().length);
  readonly isDirty = computed(() => this.draft().trim() !== this.roster().trim());

  constructor() {
    // Reset the draft whenever the saved value changes (initial load, after save).
    effect(() => this.rosterControl.setValue(this.roster()));
  }

  save(): void {
    this.rosterSaved.emit(this.rosterControl.value.trim());
  }
}
