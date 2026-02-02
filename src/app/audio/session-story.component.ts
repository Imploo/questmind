import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-session-story',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="border border-gray-200 rounded-xl bg-white shadow-sm p-6">
      <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h3 class="text-lg font-semibold m-0">{{ title }}</h3>
          <p class="text-sm text-gray-500 m-0">{{ subtitle }}</p>
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            class="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:text-gray-800"
            (click)="toggleEdit()"
            [disabled]="isBusy || !story.trim().length"
          >
            {{ isEditing() ? 'Preview' : 'Edit' }}
          </button>
          <button
            type="button"
            class="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:text-gray-800 disabled:text-gray-300"
            (click)="retranscribe.emit()"
            [disabled]="isBusy || !canRetranscribe"
          >
            Re-transcribe
          </button>
        </div>
      </div>

      @if (story.trim().length) {
        <div class="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <h4 class="text-base font-semibold m-0">Generated Story</h4>
              <button
                type="button"
                class="px-3 py-2 text-xs font-semibold rounded-lg bg-primary text-white hover:bg-primary-dark disabled:bg-gray-300"
                (click)="regenerate.emit()"
                [disabled]="isBusy"
              >
                Regenerate Story
              </button>
            </div>

            <div class="border border-gray-200 rounded-lg p-4">
              @if (isEditing()) {
                <textarea
                  class="w-full min-h-[220px] border border-gray-200 rounded-lg p-3 text-sm focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
                  [value]="draft()"
                  (input)="onDraftInput($event)"
                  [disabled]="isBusy"
                ></textarea>
                <div class="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    class="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:text-gray-800"
                    (click)="resetDraft()"
                    [disabled]="isBusy"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    class="px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-300"
                    (click)="saveDraft()"
                    [disabled]="isBusy"
                  >
                    Save Story
                  </button>
                </div>
              } @else {
                <div class="text-sm text-gray-700 leading-relaxed" [innerHTML]="renderedStory()"></div>
              }
            </div>

            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:text-gray-800"
                (click)="downloadMarkdown()"
              >
                Download Markdown
              </button>
              <button
                type="button"
                class="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:text-gray-800"
                (click)="downloadPdf()"
              >
                Export PDF
              </button>
            </div>

            @if (transcript) {
              <div class="border-t border-gray-100 pt-4">
                <button
                  type="button"
                  class="text-sm font-semibold text-primary hover:underline"
                  (click)="toggleTranscript()"
                >
                  {{ showTranscript() ? 'Hide transcript' : 'Show transcript preview' }}
                </button>
                @if (showTranscript()) {
                  <pre class="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 whitespace-pre-wrap">
{{ transcript }}
                  </pre>
                }
              </div>
            }
          </div>

          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <h4 class="text-base font-semibold m-0">Corrections & Guidance</h4>
              @if (correctionsStatus !== 'idle') {
                <span class="text-xs text-gray-500">
                  {{ correctionsStatus === 'saving' ? 'Saving...' : 'Saved ✓' }}
                </span>
              }
            </div>

            <div class="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
              <p class="text-sm text-gray-600 m-0">
                Review the story and add corrections below. The AI will apply these when you regenerate the story.
              </p>
              <textarea
                class="w-full min-h-[240px] border border-gray-200 rounded-lg p-3 text-sm focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none resize-vertical font-mono"
                [value]="corrections"
                (input)="onCorrectionsInput($event)"
                [disabled]="isBusy"
                placeholder="Example: When you hear 'corikan', the correct name is 'Khuri-Khan'. The party is in Waterdeep, not Baldur's Gate."
              ></textarea>
              <p class="text-xs text-gray-500 m-0">
                Corrections auto-save as you type. Click "Regenerate Story" to apply them.
              </p>
            </div>
          </div>
        </div>
      } @else {
        <div class="border border-dashed border-gray-200 rounded-lg p-6 text-sm text-gray-500">
          The session story will appear here once generation completes.
        </div>
      }
    </div>
  `
})
export class SessionStoryComponent implements OnChanges {
  private readonly sanitizer = inject(DomSanitizer);

  @Input() title = 'Session Story';
  @Input() subtitle = '';
  @Input() story = '';
  @Input() transcript = '';
  @Input() isBusy = false;
  @Input() canRetranscribe = false;
  @Input() corrections = '';
  @Input() correctionsStatus: 'idle' | 'saving' | 'saved' = 'idle';
  @Output() storyUpdated = new EventEmitter<string>();
  @Output() regenerate = new EventEmitter<void>();
  @Output() retranscribe = new EventEmitter<void>();
  @Output() correctionsChanged = new EventEmitter<string>();

  isEditing = signal<boolean>(false);
  draft = signal<string>('');
  renderedStory = signal<SafeHtml>('');
  showTranscript = signal<boolean>(false);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['story']) {
      this.draft.set(this.story);
      this.renderedStory.set(this.sanitizer.bypassSecurityTrustHtml(this.convertMarkdown(this.story)));
    }
  }

  toggleEdit(): void {
    this.isEditing.set(!this.isEditing());
  }

  onDraftInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.draft.set(target.value);
  }

  resetDraft(): void {
    this.draft.set(this.story);
  }

  saveDraft(): void {
    this.storyUpdated.emit(this.draft());
    this.isEditing.set(false);
  }

  toggleTranscript(): void {
    this.showTranscript.set(!this.showTranscript());
  }

  onCorrectionsInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.correctionsChanged.emit(target.value);
  }

  downloadMarkdown(): void {
    const blob = new Blob([this.story || ''], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${this.slugify(this.title || 'session-story')}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  downloadPdf(): void {
    const html = `
      <html>
        <head>
          <title>${this.title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; line-height: 1.6; }
            h1, h2, h3 { margin-top: 24px; }
          </style>
        </head>
        <body>
          ${this.convertMarkdown(this.story)}
        </body>
      </html>
    `;
    const popup = window.open('', '_blank');
    if (!popup) {
      return;
    }
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  private convertMarkdown(markdown: string): string {
    const escaped = markdown
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return escaped
      .replace(/^### (.*)$/gm, '<h3>$1</h3>')
      .replace(/^## (.*)$/gm, '<h2>$1</h2>')
      .replace(/^# (.*)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/^\s*-\s+(.*)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/gms, '<ul>$1</ul>')
      .replace(/\n{2,}/g, '<br/><br/>')
      .replace(/\n/g, '<br/>');
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }
}
