import { ChangeDetectionStrategy, Component, ElementRef, input, output, signal, viewChild } from '@angular/core';

/**
 * Asks where an imported character comes from: a character sheet PDF, or the share
 * link of a QuestMind character. The page that opens it does the actual import.
 */
@Component({
  selector: 'app-import-character-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close()' },
  template: `
    <div class="qm-scrim flex items-center justify-center p-4" (click)="close()">
      <div
        class="qm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-character-title"
        (click)="$event.stopPropagation()"
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="qm-eyebrow">New character</div>
            <h2 id="import-character-title" class="qm-display text-xl">Import a character</h2>
          </div>
          <button
            type="button"
            class="qm-btn qm-btn-ghost qm-btn-icon -mr-2 -mt-1"
            aria-label="Close"
            [disabled]="busy()"
            (click)="close()"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        @if (mode() === 'choose') {
          <p class="mt-1 mb-5 text-sm qm-muted">Where does the character come from?</p>

          <div class="grid gap-3">
            <button type="button" class="option" [disabled]="busy()" (click)="pickPdf()">
              <span class="qm-medallion">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2zM9 13h6M9 17h4" /></svg>
              </span>
              <span>
                <span class="block font-semibold">PDF</span>
                <span class="block text-sm qm-muted">Upload a character sheet. The AI reads it and fills in a new character.</span>
              </span>
            </button>

            <button type="button" class="option" [disabled]="busy()" (click)="mode.set('link')">
              <span class="qm-medallion">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
              </span>
              <span>
                <span class="block font-semibold">Link</span>
                <span class="block text-sm qm-muted">Paste the share link of a QuestMind character to get your own copy.</span>
              </span>
            </button>
          </div>

          <input #pdfInput type="file" accept=".pdf,application/pdf" class="hidden" (change)="onFile($event)" />
        } @else {
          <form class="mt-4" (submit)="submitLink($event)">
            <label for="import-character-link" class="qm-label">Share link</label>
            <input
              id="import-character-link"
              type="url"
              inputmode="url"
              autocomplete="off"
              placeholder="https://…/share/character/…"
              class="qm-input"
              [value]="link()"
              [disabled]="busy()"
              (input)="link.set($any($event.target).value)"
            />
            <p class="qm-help mt-2">
              The Share button on a character sheet copies its link. You get a copy of the character as built, with its portraits; the original stays as it is.
            </p>

            <div class="mt-5 flex items-center justify-between gap-3">
              <button type="button" class="qm-btn qm-btn-ghost" [disabled]="busy()" (click)="mode.set('choose')">
                Back
              </button>
              <button type="submit" class="qm-btn qm-btn-primary" [disabled]="busy() || !link().trim()">
                @if (busy()) {
                  <span class="qm-spinner qm-spinner-light" aria-hidden="true"></span>
                }
                {{ busy() ? 'Importing…' : 'Import' }}
              </button>
            </div>
          </form>
        }

        @if (busy() && mode() === 'choose') {
          <p class="mt-4 flex items-center gap-2 text-sm qm-muted" role="status">
            <span class="qm-spinner" aria-hidden="true"></span>
            Creating the character…
          </p>
        }
        @if (error()) {
          <p class="qm-alert mt-4" role="alert">{{ error() }}</p>
        }
      </div>
    </div>
  `,
  styles: [`
    .option {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.9rem 1rem;
      border-radius: 12px;
      text-align: left;
      background: var(--paper-2);
      border: 1px solid var(--line);
      transition: border-color 0.15s, background 0.15s;
    }
    .option:hover:not(:disabled) { border-color: var(--gold); background: var(--gold-soft); }
    .option:disabled { opacity: 0.55; cursor: not-allowed; }
  `]
})
export class ImportCharacterDialogComponent {
  /** True while the page is importing; the dialog then cannot be closed or changed. */
  busy = input(false);
  error = input('');

  pdfSelected = output<File>();
  linkSubmitted = output<string>();
  closed = output<void>();

  mode = signal<'choose' | 'link'>('choose');
  link = signal('');
  private readonly pdfInput = viewChild<ElementRef<HTMLInputElement>>('pdfInput');

  pickPdf(): void {
    this.pdfInput()?.nativeElement.click();
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset so the same file can be picked again after an error.
    input.value = '';
    if (file) this.pdfSelected.emit(file);
  }

  submitLink(event: Event): void {
    event.preventDefault();
    const link = this.link().trim();
    if (link && !this.busy()) this.linkSubmitted.emit(link);
  }

  close(): void {
    if (!this.busy()) this.closed.emit();
  }
}
