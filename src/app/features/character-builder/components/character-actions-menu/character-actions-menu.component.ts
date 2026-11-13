import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ConnectedPosition } from '@angular/cdk/overlay';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';

/** Opens below the button, right edges aligned; above it when there is no room below. */
const MENU_POSITIONS: ConnectedPosition[] = [
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 },
];

/**
 * The "…" button of a character sheet with the actions on the character as a whole:
 * PDF, version history, clone, share and archive. Which ones show depends on the viewer.
 */
@Component({
  selector: 'app-character-actions-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkMenuTrigger, CdkMenu, CdkMenuItem],
  template: `
    <button
      type="button"
      class="trigger"
      aria-label="Character actions"
      title="More actions"
      [attr.aria-busy]="busy()"
      [cdkMenuTriggerFor]="menu"
      [cdkMenuPosition]="positions"
    >
      @if (busy()) {
        <span class="spinner" aria-hidden="true"></span>
      } @else {
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.75" /><circle cx="12" cy="12" r="1.75" /><circle cx="19" cy="12" r="1.75" />
        </svg>
      }
    </button>

    <ng-template #menu>
      <div class="menu" cdkMenu>
        <button type="button" class="item" cdkMenuItem [cdkMenuItemDisabled]="exportingPdf()" (cdkMenuItemTriggered)="exportPdf.emit()">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          {{ exportingPdf() ? 'Preparing PDF…' : 'Download PDF' }}
        </button>
        @if (canViewHistory()) {
          <button type="button" class="item" cdkMenuItem (cdkMenuItemTriggered)="viewHistory.emit()">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            History
          </button>
        }
        @if (canClone()) {
          <button type="button" class="item" cdkMenuItem title="Copy this character to your own account" [cdkMenuItemDisabled]="cloning()" (cdkMenuItemTriggered)="cloneCharacter.emit()">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            {{ cloning() ? 'Cloning…' : 'Clone' }}
          </button>
        }
        <button type="button" class="item" cdkMenuItem title="Copy a link to this character" (cdkMenuItemTriggered)="share.emit()">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
          Share
        </button>
        @if (canArchive()) {
          <div class="divider" role="separator"></div>
          <button type="button" class="item" cdkMenuItem (cdkMenuItemTriggered)="archivedChange.emit(!archived())">
            @if (archived()) {
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-7 9v-5m0 0l-2 2m2-2l2 2" /></svg>
              Unarchive
            } @else {
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
              Archive
            }
          </button>
        }
      </div>
    </ng-template>
  `,
  styles: [`
    :host { display: inline-flex; }

    .trigger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 8px;
      color: var(--ink, #2a2320);
      background: var(--paper, #fffdf8);
      border: 1px solid var(--line, #e8dcc5);
      cursor: pointer;
      touch-action: manipulation;
      transition: border-color 0.15s, background 0.15s;
    }
    .trigger:hover, .trigger[aria-expanded='true'] { border-color: var(--gold, #b48a3c); background: var(--gold-soft, #f2e6cb); }
    .trigger svg { width: 1.25rem; height: 1.25rem; }

    .spinner {
      width: 1rem;
      height: 1rem;
      border-radius: 50%;
      border: 2px solid var(--line, #e8dcc5);
      border-top-color: var(--gold-deep, #8a6623);
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* The menu opens in an overlay outside the sheet, so it carries its own colours. */
    .menu {
      display: flex;
      flex-direction: column;
      min-width: 12rem;
      padding: 0.35rem;
      border-radius: 12px;
      color: #2a2320;
      background: #fffdf8;
      border: 1px solid #e8dcc5;
      box-shadow: 0 2px 4px rgba(60, 40, 10, 0.06), 0 16px 32px -12px rgba(60, 40, 10, 0.35);
    }
    .item {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      min-height: 40px;
      padding: 0.4rem 0.75rem;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      text-align: left;
      color: inherit;
      background: transparent;
      border: 0;
      cursor: pointer;
    }
    .item svg { width: 1rem; height: 1rem; flex-shrink: 0; color: #8a6623; }
    .item:hover, .item:focus-visible { background: #f2e6cb; outline: none; }
    .item[aria-disabled='true'] { opacity: 0.55; cursor: wait; }
    .item[aria-disabled='true']:hover { background: transparent; }
    .divider { height: 1px; margin: 0.3rem 0.4rem; background: #e8dcc5; }
  `]
})
export class CharacterActionsMenuComponent {
  /** Version history is the owner's. */
  canViewHistory = input(false);
  /** A signed-in visitor can copy the character to their own account. */
  canClone = input(false);
  /** Archiving is the owner's. */
  canArchive = input(false);
  archived = input(false);
  exportingPdf = input(false);
  cloning = input(false);

  exportPdf = output<void>();
  viewHistory = output<void>();
  cloneCharacter = output<void>();
  share = output<void>();
  /** The archived state the owner asked for. */
  archivedChange = output<boolean>();

  /** The menu closes on a click, so the button itself shows that an action is running. */
  busy = computed(() => this.exportingPdf() || this.cloning());

  protected readonly positions = MENU_POSITIONS;
}
