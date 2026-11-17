import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { LimitedUses, UsesRecharge } from '../../../../shared/models/dnd-character.model';
import { CustomFeat } from '../../../../shared/models/character-play-state.model';
import { customFeatUsesKey } from '../../../../shared/utils/character-play-state';
import { MarkdownComponent } from '../../../../shared/components/markdown.component';
import { I18nService } from '../../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { PLAY_TERMS } from '../../../../shared/dnd-terms';
import { TrackerEditorComponent } from './tracker-editor.component';
import { UsePipsComponent } from './use-pips.component';

export interface CustomFeatChange {
  id: string;
  changes: Partial<Pick<CustomFeat, 'name' | 'description'>>;
}

/** A uses tracker was added, changed or (uses: null) removed on a custom feat. */
export interface CustomFeatUsesChange {
  id: string;
  uses: LimitedUses | null;
}

export interface CustomFeatSpentChange {
  /** The tracker key of the feat, see customFeatUsesKey(). */
  key: string;
  spent: number;
}

interface FeatView {
  feat: CustomFeat;
  tracker: { key: string; max: number; spent: number; rechargeLabel: string } | null;
}

/**
 * Feats the player writes down by hand, such as one the DM made up. A new feat is
 * added inline by name and opens to fill in what it does; like a feature of the build
 * it can get a uses tracker.
 */
@Component({
  selector: 'app-custom-feats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MarkdownComponent, TrackerEditorComponent, UsePipsComponent, TranslatePipe],
  template: `
    @for (view of views(); track view.feat.id) {
      @let feat = view.feat;
      <div class="row">
        <button type="button" class="head" [attr.aria-expanded]="expanded().has(feat.id)" (click)="toggle(feat.id)">
          <svg class="chevron" [class.is-open]="expanded().has(feat.id)" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
          <span class="name">{{ feat.name }}</span>
        </button>

        @if (view.tracker; as tracker) {
          <span class="tracker">
            <span class="recharge">{{ tracker.rechargeLabel }}</span>
            <app-use-pips
              [total]="tracker.max"
              [spent]="tracker.spent"
              [label]="'play.feats.usesLabel' | translate: feat.name"
              [editable]="editable()"
              (spentChange)="spentChange.emit({ key: tracker.key, spent: $event })"
            />
          </span>
        }
      </div>

      @if (expanded().has(feat.id)) {
        <div class="body">
          @if (editing() === feat.id) {
            <form class="form" (submit)="save($event, feat.id)">
              <label class="field">
                <span>{{ 'common.name' | translate }}</span>
                <input type="text" maxlength="80" [value]="draftName()" (input)="draftName.set($any($event.target).value)" />
              </label>
              <label class="field">
                <span>{{ 'common.description' | translate }}</span>
                <textarea
                  rows="5"
                  maxlength="4000"
                  [placeholder]="'play.feats.descriptionPlaceholder' | translate"
                  [value]="draftDescription()"
                  (input)="draftDescription.set($any($event.target).value)"
                ></textarea>
              </label>
              <div class="actions">
                <button type="button" class="btn is-remove" (click)="remove(feat.id)">{{ 'play.feats.remove' | translate }}</button>
                <span class="spacer"></span>
                <button type="button" class="btn" (click)="editing.set(null)">{{ 'common.cancel' | translate }}</button>
                <button type="submit" class="btn is-primary" [disabled]="!draftName().trim()">{{ 'common.save' | translate }}</button>
              </div>
            </form>
          } @else {
            <div class="body-head">
              <span class="qm-eyebrow">{{ 'play.feats.custom' | translate }}</span>
              @if (editable()) {
                <button type="button" class="btn is-small" (click)="edit(feat)">{{ 'play.feats.edit' | translate }}</button>
              }
            </div>
            @if (feat.description) {
              <app-markdown [text]="feat.description" />
            } @else {
              <span class="is-empty">{{ 'play.feats.noDescription' | translate }}</span>
            }
            @if (editable()) {
              <app-tracker-editor [uses]="feat.uses ?? null" (usesChange)="usesChange.emit({ id: feat.id, uses: $event })" />
            }
          }
        </div>
      }
    }

    @if (editable()) {
      <form class="add" (submit)="add($event)">
        <input
          type="text"
          maxlength="80"
          [placeholder]="'play.feats.addPlaceholder' | translate"
          [attr.aria-label]="'play.feats.newFeatName' | translate"
          [value]="newName()"
          (input)="newName.set($any($event.target).value)"
        />
        <button type="submit" [disabled]="!newName().trim()">{{ 'common.add' | translate }}</button>
      </form>
    }
  `,
  styles: [`
    :host { display: block; }

    /* The same line as a feature of the build: the expandable name plus its tracker. */
    .row { display: flex; flex-wrap: wrap; align-items: center; gap: 0 0.35rem; }
    .head {
      flex: 1 1 9rem;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.5rem;
      margin: 0 0 0 -0.5rem;
      border-radius: 8px;
      text-align: left;
      font-size: 0.875rem;
      color: var(--ink, #2a2320);
      background: transparent;
      border: none;
      cursor: pointer;
      touch-action: manipulation;
      user-select: none;
      transition: background 0.15s;
    }
    .head:hover { background: var(--paper-2, #f8f2e6); }
    .chevron {
      width: 0.75rem;
      height: 0.75rem;
      margin-top: 0.25rem;
      align-self: flex-start;
      flex-shrink: 0;
      fill: none;
      stroke: var(--gold, #b48a3c);
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      transition: transform 0.15s;
    }
    .chevron.is-open { transform: rotate(90deg); }
    .name { flex: 1; min-width: 0; font-weight: 600; overflow-wrap: anywhere; }
    .tracker { display: inline-flex; align-items: center; gap: 0.5rem; margin-left: auto; }
    .tracker app-use-pips:not(.is-pool) { margin-right: -0.5rem; }
    .recharge { font-size: 0.7rem; font-weight: 500; letter-spacing: 0.04em; color: var(--muted, #7b6e60); }

    .body {
      margin: 0.25rem 0 0.6rem 0.75rem;
      padding: 0.25rem 0 0.25rem 0.85rem;
      border-left: 2px solid var(--gold-soft, #f2e6cb);
      font-size: 0.82rem;
      line-height: 1.55;
      color: #4d4339;
    }
    .body-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; min-height: 32px; margin-bottom: 0.25rem; }
    .is-empty { font-style: italic; color: var(--muted, #7b6e60); }

    .form { display: flex; flex-direction: column; gap: 0.6rem; }
    .field { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.75rem; font-weight: 600; color: var(--muted, #7b6e60); }
    .field input, .field textarea, .add input {
      width: 100%;
      padding: 0.45rem 0.6rem;
      /* 16px keeps iOS from zooming in when a field gets focus. */
      font-size: 1rem;
      font-weight: 400;
      color: var(--ink, #2a2320);
      background: var(--paper, #fffdf8);
      border: 1px solid #d9c9a6;
      border-radius: 8px;
    }
    .field input, .add input { min-height: 40px; }
    .field textarea { resize: vertical; line-height: 1.5; }
    .field input:focus, .field textarea:focus, .add input:focus { outline: none; border-color: var(--gold, #b48a3c); }

    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    .spacer { flex: 1; }
    .btn, .add button {
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
    .btn:disabled, .add button:disabled { opacity: 0.5; cursor: default; }
    .btn.is-small { min-height: 32px; padding: 0 0.7rem; font-size: 0.78rem; color: var(--gold-deep, #8a6623); }
    .btn.is-small:hover, .add button:hover:not(:disabled) { background: var(--gold-soft, #f2e6cb); }
    .btn.is-primary { font-weight: 700; color: #f6efe0; background: var(--ink, #2a2320); border-color: var(--ink, #2a2320); }
    .btn.is-remove { color: #8a2732; background: transparent; border-color: transparent; padding-left: 0; }

    .add { display: flex; gap: 0.5rem; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px dashed #efe6d4; }
    .add input { flex: 1; min-width: 0; }
    .add button { color: var(--gold-deep, #8a6623); }
  `]
})
export class CustomFeatsComponent {
  feats = input.required<CustomFeat[]>();
  /** Spent uses per tracker key, as the play state has them. */
  usesSpent = input<Record<string, number>>({});
  editable = input(false);

  /** A new feat, with the id it should get. */
  added = output<{ id: string; name: string }>();
  updated = output<CustomFeatChange>();
  usesChange = output<CustomFeatUsesChange>();
  spentChange = output<CustomFeatSpentChange>();
  removed = output<string>();

  private readonly i18n = inject(I18nService);

  newName = signal('');
  expanded = signal<ReadonlySet<string>>(new Set());
  /** Id of the feat whose name and text are being edited. */
  editing = signal<string | null>(null);
  draftName = signal('');
  draftDescription = signal('');

  views = computed<FeatView[]>(() => {
    const spent = this.usesSpent();
    return this.feats().map(feat => {
      const key = customFeatUsesKey(feat.id);
      const tracker = feat.uses
        ? { key, max: feat.uses.max, spent: spent[key] ?? 0, rechargeLabel: this.rechargeLabel(feat.uses.recharge) }
        : null;
      return { feat, tracker };
    });
  });

  /** The rests are game terms; resetting by hand is said in the active language. */
  private rechargeLabel(recharge: UsesRecharge): string {
    return recharge === 'shortRest' || recharge === 'longRest' ? PLAY_TERMS.recharge[recharge] : this.i18n.t().play.tracker.manual;
  }

  toggle(id: string): void {
    this.expanded.update(open => {
      const next = new Set(open);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  /** Adds the feat and opens it for editing, so its text can be written right away. */
  add(event: Event): void {
    event.preventDefault();
    const name = this.newName().trim();
    if (!name) return;
    const id = crypto.randomUUID();
    this.added.emit({ id, name });
    this.newName.set('');
    this.expanded.update(open => new Set(open).add(id));
    this.edit({ id, name, description: '' });
  }

  edit(feat: CustomFeat): void {
    this.draftName.set(feat.name);
    this.draftDescription.set(feat.description);
    this.editing.set(feat.id);
  }

  save(event: Event, id: string): void {
    event.preventDefault();
    const name = this.draftName().trim();
    if (!name) return;
    this.editing.set(null);
    this.updated.emit({ id, changes: { name, description: this.draftDescription().trim() } });
  }

  remove(id: string): void {
    this.editing.set(null);
    this.removed.emit(id);
  }
}
