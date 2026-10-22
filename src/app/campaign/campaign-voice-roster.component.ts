import { ChangeDetectionStrategy, Component, computed, effect, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

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
  imports: [ReactiveFormsModule],
  template: `
    <div class="bg-gray-50 p-4 rounded-lg mt-3">
      <label for="voice-roster" class="block text-sm font-medium text-gray-700 mb-1">
        Speaking order of the introduction
      </label>
      <p id="voice-roster-help" class="text-xs text-gray-600 mb-2">
        Describe who speaks in which order in the recording above, one person per line.
        The AI uses this to link each voice in the introduction to the right character.
      </p>

      @if (canEdit()) {
        <textarea
          id="voice-roster"
          rows="5"
          aria-describedby="voice-roster-help"
          [attr.maxlength]="maxLength"
          [formControl]="rosterControl"
          [placeholder]="placeholder"
          class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        ></textarea>
        <div class="mt-2 flex items-center gap-3">
          <button
            type="button"
            (click)="save()"
            [disabled]="!isDirty() || isBusy()"
            class="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {{ isBusy() ? 'Saving...' : 'Save speaking order' }}
          </button>
          <span class="text-xs text-gray-500">{{ length() }} / {{ maxLength }}</span>
        </div>
      } @else if (roster()) {
        <p id="voice-roster" class="text-sm text-gray-900 whitespace-pre-line">{{ roster() }}</p>
      } @else {
        <p id="voice-roster" class="text-sm text-gray-500">No speaking order provided.</p>
      }

      <div aria-live="polite">
        @if (errorMessage()) {
          <p class="mt-2 text-sm text-red-700">{{ errorMessage() }}</p>
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
  readonly placeholder = '1. DM (Matt)\n2. Thorin, dwarven fighter (Jan)\n3. Lyra, elven wizard (Sanne)';

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
