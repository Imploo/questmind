import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { LimitedUses, UsesRecharge } from '../../../../shared/models/dnd-character.model';
import { MAX_USES } from '../../../../shared/utils/character-play-state';
import { I18nService } from '../../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { PLAY_TERMS } from '../../../../shared/dnd-terms';

/**
 * Shown under the text of a feature, spell or custom feat: says what its uses tracker is, and
 * opens a small form to add, change or remove it.
 */
@Component({
  selector: 'app-tracker-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    @if (editing()) {
      <div class="form">
        <div class="field">
          <span class="field-label">{{ 'play.tracker.uses' | translate }}</span>
          <button type="button" class="step" [attr.aria-label]="'play.tracker.fewerUses' | translate" [disabled]="max() <= 1" (click)="max.set(max() - 1)">−</button>
          <span class="value">{{ max() }}</span>
          <button type="button" class="step" [attr.aria-label]="'play.tracker.moreUses' | translate" [disabled]="max() >= maxUses" (click)="max.set(max() + 1)">+</button>
        </div>

        <div class="field">
          <span class="field-label">{{ 'play.tracker.rechargesOn' | translate }}</span>
          @for (option of rechargeOptions(); track option.value) {
            <button type="button" class="choice" [class.is-selected]="recharge() === option.value" [attr.aria-pressed]="recharge() === option.value" (click)="recharge.set(option.value)">
              {{ option.label }}
            </button>
          }
        </div>

        <div class="actions">
          @if (uses()) {
            <button type="button" class="btn is-remove" (click)="finish(null)">{{ 'play.tracker.remove' | translate }}</button>
          }
          <span class="spacer"></span>
          <button type="button" class="btn" (click)="editing.set(false)">{{ 'common.cancel' | translate }}</button>
          <button type="button" class="btn is-primary" (click)="finish({ max: max(), recharge: recharge() })">{{ 'common.save' | translate }}</button>
        </div>
      </div>
    } @else {
      <div class="summary">
        @if (uses(); as tracker) {
          <span>{{ 'play.tracker.summary' | translate: tracker.max : tracker.recharge }}</span>
        }
        <button type="button" class="btn is-small" (click)="open()">{{ (uses() ? 'play.tracker.edit' : 'play.tracker.add') | translate }}</button>
      </div>
    }
  `,
  styles: [`
    :host { display: block; margin-top: 0.6rem; color: var(--ink, #2a2320); }
    .summary {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      padding-top: 0.6rem;
      border-top: 1px dashed var(--line, #e8dcc5);
      font-size: 0.78rem;
      color: var(--muted, #7b6e60);
    }
    .form {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: 0.85rem;
      border-radius: 10px;
      background: var(--paper-2, #f8f2e6);
      border: 1px solid var(--line, #e8dcc5);
    }
    .field { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    .field-label { width: 5.75rem; font-size: 0.82rem; font-weight: 600; }
    .value { min-width: 1.75rem; text-align: center; font-size: 1.1rem; font-weight: 700; font-variant-numeric: tabular-nums; }
    .step {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      font-size: 1.2rem;
      font-weight: 600;
      line-height: 1;
      color: var(--gold-deep, #8a6623);
      background: var(--paper, #fffdf8);
      border: 1px solid #d9c9a6;
      cursor: pointer;
    }
    .step:disabled { opacity: 0.45; cursor: default; }
    .choice {
      min-height: 40px;
      padding: 0 0.85rem;
      border-radius: 999px;
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--ink, #2a2320);
      background: var(--paper, #fffdf8);
      border: 1.5px solid #d9c9a6;
      cursor: pointer;
    }
    .choice.is-selected { color: #f6efe0; background: var(--ink, #2a2320); border-color: var(--ink, #2a2320); }
    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    .spacer { flex: 1; }
    .btn {
      min-height: 40px;
      padding: 0 0.9rem;
      border-radius: 8px;
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--ink, #2a2320);
      background: var(--paper, #fffdf8);
      border: 1px solid #d9c9a6;
      cursor: pointer;
    }
    .btn.is-small { min-height: 32px; padding: 0 0.7rem; font-size: 0.78rem; color: var(--gold-deep, #8a6623); }
    .btn.is-small:hover { background: var(--gold-soft, #f2e6cb); }
    .btn.is-primary { font-weight: 700; color: #f6efe0; background: var(--ink, #2a2320); border-color: var(--ink, #2a2320); }
    .btn.is-remove { color: #8a2732; background: transparent; border-color: transparent; padding-left: 0; }
  `]
})
export class TrackerEditorComponent {
  /** The current tracker, or null when there is none yet. */
  uses = input<LimitedUses | null>(null);
  /** The new tracker, or null when it was removed. */
  usesChange = output<LimitedUses | null>();

  editing = signal(false);
  max = signal(1);
  recharge = signal<UsesRecharge>('longRest');

  private readonly i18n = inject(I18nService);

  /** The rests are game terms; resetting by hand is said in the active language. */
  readonly rechargeOptions = computed((): { value: UsesRecharge; label: string }[] => [
    { value: 'shortRest', label: PLAY_TERMS.recharge.shortRest },
    { value: 'longRest', label: PLAY_TERMS.recharge.longRest },
    { value: 'manual', label: this.i18n.t().play.tracker.manual },
  ]);
  readonly maxUses = MAX_USES;

  open(): void {
    this.max.set(this.uses()?.max ?? 1);
    this.recharge.set(this.uses()?.recharge ?? 'longRest');
    this.editing.set(true);
  }

  finish(uses: LimitedUses | null): void {
    this.editing.set(false);
    this.usesChange.emit(uses);
  }
}
