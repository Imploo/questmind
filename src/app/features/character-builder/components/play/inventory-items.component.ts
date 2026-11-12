import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { InventoryItem } from '../../../../shared/models/character-play-state.model';

export interface InventoryItemChange {
  id: string;
  changes: Partial<Pick<InventoryItem, 'value' | 'description'>>;
}

/**
 * Items the player keeps by hand. A new item is added inline by name; clicking an
 * item opens it to fill in its value and a description. Changes are saved as soon as
 * a field is left.
 */
@Component({
  selector: 'app-inventory-items',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (item of items(); track item.id) {
      <div class="item">
        <button type="button" class="head" [attr.aria-expanded]="expanded().has(item.id)" (click)="toggle(item.id)">
          <svg class="chevron" [class.is-open]="expanded().has(item.id)" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
          <span class="name">{{ item.name }}</span>
          @if (item.value) {
            <span class="value">{{ item.value }}</span>
          }
        </button>

        @if (expanded().has(item.id)) {
          <div class="body">
            @if (editable()) {
              <label class="field">
                <span>Value</span>
                <input
                  type="text"
                  maxlength="60"
                  placeholder="20, 50 gp, 3 charges…"
                  [value]="item.value"
                  (change)="updated.emit({ id: item.id, changes: { value: $any($event.target).value.trim() } })"
                  (keydown.enter)="$any($event.target).blur()"
                />
              </label>
              <label class="field">
                <span>Description</span>
                <textarea
                  rows="3"
                  maxlength="2000"
                  placeholder="What it is, what it does…"
                  [value]="item.description"
                  (change)="updated.emit({ id: item.id, changes: { description: $any($event.target).value.trim() } })"
                ></textarea>
              </label>
              <button type="button" class="remove" (click)="removed.emit(item.id)">Remove item</button>
            } @else if (item.description) {
              <p class="description">{{ item.description }}</p>
            } @else {
              <p class="description is-empty">No description</p>
            }
          </div>
        }
      </div>
    }

    @if (editable()) {
      <form class="add" (submit)="add($event)">
        <input
          type="text"
          maxlength="80"
          placeholder="Add an item…"
          aria-label="Name of the new item"
          [value]="newName()"
          (input)="newName.set($any($event.target).value)"
        />
        <button type="submit" [disabled]="!newName().trim()">Add</button>
      </form>
    }
  `,
  styles: [`
    :host { display: block; }
    .item { border-bottom: 1px dashed #efe6d4; }
    .head {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      width: 100%;
      min-height: 40px;
      padding: 0.3rem 0;
      text-align: left;
      font-size: 0.875rem;
      color: var(--ink, #2a2320);
      background: transparent;
      border: none;
      cursor: pointer;
      touch-action: manipulation;
    }
    .chevron { width: 0.75rem; height: 0.75rem; flex-shrink: 0; fill: none; stroke: var(--gold, #b48a3c); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: transform 0.15s; }
    .chevron.is-open { transform: rotate(90deg); }
    .name { flex: 1; min-width: 0; font-weight: 600; overflow-wrap: anywhere; }
    .value { flex-shrink: 0; max-width: 50%; font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; overflow-wrap: anywhere; }

    .body {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      margin: 0.1rem 0 0.75rem 0.3rem;
      padding: 0.25rem 0 0.25rem 0.85rem;
      border-left: 2px solid var(--gold-soft, #f2e6cb);
    }
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
    .remove {
      align-self: flex-start;
      min-height: 32px;
      padding: 0;
      font-size: 0.78rem;
      font-weight: 600;
      color: #8a2732;
      background: transparent;
      border: none;
      cursor: pointer;
    }
    .description { margin: 0; font-size: 0.82rem; line-height: 1.55; color: #4d4339; white-space: pre-line; }
    .description.is-empty { font-style: italic; color: var(--muted, #7b6e60); }

    .add { display: flex; gap: 0.5rem; margin-top: 0.6rem; }
    .add input { flex: 1; min-width: 0; }
    .add button {
      min-height: 40px;
      padding: 0 0.9rem;
      border-radius: 8px;
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--gold-deep, #8a6623);
      background: var(--paper, #fffdf8);
      border: 1px solid #d9c9a6;
      cursor: pointer;
    }
    .add button:hover:not(:disabled) { background: var(--gold-soft, #f2e6cb); }
    .add button:disabled { opacity: 0.5; cursor: default; }
  `]
})
export class InventoryItemsComponent {
  items = input.required<InventoryItem[]>();
  editable = input(false);

  /** A new item, with the id it should get. */
  added = output<{ id: string; name: string }>();
  updated = output<InventoryItemChange>();
  removed = output<string>();

  newName = signal('');
  expanded = signal<ReadonlySet<string>>(new Set());

  toggle(id: string): void {
    this.expanded.update(open => {
      const next = new Set(open);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  /** Adds the item and opens it, so its value and description can be filled in right away. */
  add(event: Event): void {
    event.preventDefault();
    const name = this.newName().trim();
    if (!name) return;
    const id = crypto.randomUUID();
    this.added.emit({ id, name });
    this.newName.set('');
    this.expanded.update(open => new Set(open).add(id));
  }
}
