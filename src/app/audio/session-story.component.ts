import { ChangeDetectionStrategy, Component, SecurityContext, effect, inject, input, output, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { marked } from 'marked';
import { PodcastVersion } from './services/audio-session.models';
import { ToastService } from '../shared/services/toast.service';
import { PodcastVersionItemComponent } from '../shared/components/podcast-version-item.component';

export interface SessionMetaUpdate {
  title: string;
  sessionDate: string;
}

@Component({
  selector: 'app-session-story',
  imports: [PodcastVersionItemComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="qm-panel !p-0 overflow-hidden">
      <!-- Card Header -->
      <div class="px-5 pt-5 sm:px-6 sm:pt-6">
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-4">
          @if (isEditingMeta()) {
            <div class="flex-1 flex flex-col gap-2">
              <input
                type="text"
                class="qm-input font-display !text-lg font-bold"
                [value]="titleDraft()"
                (input)="onTitleDraftInput($event)"
                placeholder="Session title"
                aria-label="Session title"
              />
              <input
                type="date"
                class="qm-input !w-48 !text-sm"
                [value]="dateDraft()"
                (input)="onDateDraftInput($event)"
                aria-label="Session date"
              />
            </div>
            <div class="flex gap-2 self-start">
              <button type="button" class="qm-btn qm-btn-sm" (click)="cancelMetaEdit()">
                Cancel
              </button>
              <button type="button" class="qm-btn qm-btn-sm qm-btn-primary" (click)="saveMetaEdit()">
                Save
              </button>
            </div>
          } @else {
            <div class="min-w-0">
              <div class="qm-eyebrow">Session</div>
              <h3 class="qm-display text-xl sm:text-2xl leading-tight break-words">{{ title() }}</h3>
              <p class="text-sm qm-muted mt-0.5">{{ subtitle() }}</p>
            </div>
            <div class="flex gap-2 shrink-0">
              <button
                type="button"
                class="qm-btn qm-btn-sm"
                (click)="startMetaEdit()"
                [disabled]="isBusy() || !canEditStory()"
              >
                Edit
              </button>
              <button
                type="button"
                class="qm-btn qm-btn-sm qm-btn-danger"
                (click)="onDeleteClick()"
                [disabled]="isBusy() || !canEditStory()"
                title="Sessie verwijderen"
                aria-label="Sessie verwijderen"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
              </button>
            </div>
          }
        </div>

        <!-- Tabs -->
        <div class="qm-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            class="qm-tab"
            [class.is-active]="activeTab() === 'story'"
            [attr.aria-selected]="activeTab() === 'story'"
            (click)="activeTab.set('story')"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
            <span>Story</span>
          </button>
          <button
            type="button"
            role="tab"
            class="qm-tab"
            [class.is-active]="activeTab() === 'podcasts'"
            [attr.aria-selected]="activeTab() === 'podcasts'"
            (click)="activeTab.set('podcasts')"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
            <span>Podcasts</span>
            @if (podcasts().length > 0) {
              <span class="qm-badge qm-badge-violet font-sans tracking-normal">
                {{ podcasts().length }}
              </span>
            }
          </button>
        </div>
      </div>

      <!-- Tab Content -->
      <div class="p-5 sm:p-6">
        <!-- Story Tab -->
        @if (activeTab() === 'story') {
          @if (story().trim().length) {
            <div class="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
              <div class="space-y-4 min-w-0">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <h4 class="qm-section-title flex-1 !mb-0">Generated Story</h4>
                  <div class="flex gap-2">
                    <button
                      type="button"
                      class="qm-btn qm-btn-sm"
                      (click)="toggleEdit()"
                      [disabled]="isBusy() || !canEditStory()"
                    >
                      {{ isEditing() ? 'Preview' : 'Edit' }}
                    </button>
                    <button
                      type="button"
                      class="qm-btn qm-btn-sm qm-btn-primary"
                      (click)="regenerate.emit()"
                      [disabled]="isBusy() || !canRegenerate()"
                    >
                      Regenerate Story
                    </button>
                  </div>
                </div>

                <div>
                  @if (isEditing()) {
                    <textarea
                      class="qm-input min-h-[320px] !text-sm"
                      [value]="draft()"
                      (input)="onDraftInput($event)"
                      [disabled]="isBusy() || !canEditStory()"
                      aria-label="Story"
                    ></textarea>
                    <div class="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        class="qm-btn qm-btn-sm"
                        (click)="resetDraft()"
                      [disabled]="isBusy() || !canEditStory()"
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        class="qm-btn qm-btn-sm qm-btn-primary"
                        (click)="saveDraft()"
                      [disabled]="isBusy() || !canEditStory()"
                      >
                        Save Story
                      </button>
                    </div>
                  } @else {
                    <div class="prose qm-prose max-w-none" [innerHTML]="renderedStory()"></div>
                  }
                </div>

                <div class="flex flex-wrap gap-2 pt-1">
                  <button type="button" class="qm-btn qm-btn-sm" (click)="downloadMarkdown()">
                    Download Markdown
                  </button>
                  <button type="button" class="qm-btn qm-btn-sm" (click)="downloadPdf()">
                    Export PDF
                  </button>
                </div>

                @if (transcript()) {
                  <div class="border-t border-dashed border-[#e0d2b6] pt-4">
                    <button type="button" class="qm-link text-sm" (click)="toggleTranscript()">
                      {{ showTranscript() ? 'Hide transcript' : 'Show transcript preview' }}
                    </button>
                    @if (showTranscript()) {
                      <pre class="qm-well mt-3 text-xs text-gray-700 whitespace-pre-wrap">
{{ transcript() }}
                      </pre>
                    }
                  </div>
                }
              </div>

              <div class="space-y-3 min-w-0">
                <div class="flex items-center justify-between gap-2">
                  <h4 class="qm-section-title flex-1 !mb-0">Corrections & Guidance</h4>
                  @if (correctionsStatus() !== 'idle') {
                    <span class="text-xs qm-muted">
                      {{ correctionsStatus() === 'saving' ? 'Saving...' : 'Saved ✓' }}
                    </span>
                  }
                </div>

                <div class="qm-well space-y-3">
                  <p class="text-sm text-gray-700">
                    Review the story and add corrections below. The AI will apply these when you regenerate the story.
                  </p>
                  <textarea
                    class="qm-input min-h-[240px] !text-sm resize-y font-mono"
                    [value]="corrections()"
                    (input)="onCorrectionsInput($event)"
                    [disabled]="isBusy() || !canEditCorrections()"
                    aria-label="Corrections"
                    placeholder="Example: When you hear 'corikan', the correct name is 'Khuri-Khan'. The party is in Waterdeep, not Baldur's Gate."
                  ></textarea>
                  <p class="qm-help">
                    Corrections auto-save as you type. Click "Regenerate Story" to apply them.
                  </p>
                </div>
              </div>
            </div>
          } @else {
            <div class="rounded-xl border border-dashed border-[#d9c9a6] p-6 text-center font-prose text-lg text-gray-600">
              The session story will appear here once generation completes.
            </div>
          }
        }

        <!-- Podcasts Tab -->
        @if (activeTab() === 'podcasts') {
          <div class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="min-w-0">
                <h4 class="font-display text-base font-bold">Session Podcast</h4>
                <p class="text-sm qm-muted mt-0.5">
                  Genereer een boeiende audio recap met twee hosts die de sessie bespreken
                </p>
              </div>
              <button
                type="button"
                (click)="generatePodcast.emit()"
                [disabled]="isGeneratingPodcast() || isBusy() || !canGeneratePodcast()"
                class="qm-btn qm-btn-primary qm-btn-lg"
              >
                @if (isGeneratingPodcast()) {
                  <span class="qm-spinner qm-spinner-light" aria-hidden="true"></span>
                  <span>{{ podcastGenerationProgress() }}</span>
                } @else {
                  Genereer Podcast
                }
              </button>
            </div>

            @if (podcastError()) {
              <div class="qm-alert" role="alert">{{ podcastError() }}</div>
            }

            @if (isGeneratingPodcast()) {
              <div class="qm-alert qm-alert-info">
                <div class="flex items-center justify-between mb-2">
                  <span class="font-semibold">{{ podcastGenerationProgress() }}</span>
                  <span class="tabular-nums">{{ podcastGenerationProgressPercent() }}%</span>
                </div>
                <div class="qm-progress">
                  <div class="qm-progress-bar" [style.width.%]="podcastGenerationProgressPercent()"></div>
                </div>
                <p class="text-xs mt-2">
                  Dit kan 2-3 minuten duren. De complete MP3 wordt gegenereerd en opgeslagen.
                </p>
              </div>
            }

            @if (podcasts().length > 0) {
              <div class="space-y-3">
                <h5 class="qm-eyebrow">
                  Gegenereerde Podcasts ({{ podcasts().length }})
                </h5>
                @for (podcast of podcasts(); track podcast.version) {
                  <app-podcast-version-item
                    [podcast]="podcast"
                    [shareTarget]="campaignId() && sessionId() ? { campaignId: campaignId(), sessionId: sessionId(), podcastVersion: podcast.version } : null"
                    [downloadName]="title() || 'podcast'"
                  />
                }
              </div>
            }

            @if (podcasts().length === 0 && !isGeneratingPodcast()) {
              <div class="rounded-xl border border-dashed border-[#d9c9a6] p-6 text-center">
                <p class="font-prose text-lg text-gray-700">
                  Nog geen podcasts gegenereerd. Klik op "Genereer Podcast" om te beginnen.
                </p>
                <p class="qm-help mt-1">
                  Podcasts gebruiken AI-stemmen die natuurlijk klinkend Nederlands spreken
                </p>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `
})
export class SessionStoryComponent {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly toastService = inject(ToastService);

  title = input('Session Story');
  subtitle = input('');
  sessionDate = input('');
  story = input('');
  transcript = input('');
  isBusy = input(false);
  canRegenerate = input(false);
  canEditStory = input(false);
  canEditCorrections = input(true);
  corrections = input('');
  correctionsStatus = input<'idle' | 'saving' | 'saved'>('idle');

  // Podcast inputs
  campaignId = input('');
  sessionId = input('');
  podcasts = input<PodcastVersion[]>([]);
  isGeneratingPodcast = input(false);
  podcastGenerationProgress = input('');
  podcastGenerationProgressPercent = input(0);
  podcastError = input('');
  canGeneratePodcast = input(false);

  storyUpdated = output<string>();
  regenerate = output<void>();
  correctionsChanged = output<string>();
  generatePodcast = output<void>();
  metaUpdated = output<SessionMetaUpdate>();
  deleteSession = output<void>();

  activeTab = signal<'story' | 'podcasts'>('story');
  isEditing = signal<boolean>(false);
  isEditingMeta = signal<boolean>(false);
  titleDraft = signal<string>('');
  dateDraft = signal<string>('');
  draft = signal<string>('');
  renderedStory = signal<string>('');
  showTranscript = signal<boolean>(false);

  constructor() {
    // Configure marked options
    marked.setOptions({
      breaks: true,
      gfm: true
    });

    // React to story input changes (replaces ngOnChanges)
    effect(() => {
      const storyValue = this.story();
      this.draft.set(storyValue);
      this.renderedStory.set(this.sanitizer.sanitize(SecurityContext.HTML, this.convertMarkdown(storyValue)) ?? '');
    });
  }

  async onDeleteClick(): Promise<void> {
    const confirmed = await this.toastService.confirm('Sessie verwijderen?');
    if (confirmed) {
      this.deleteSession.emit();
    }
  }

  startMetaEdit(): void {
    this.titleDraft.set(this.title());
    this.dateDraft.set(this.sessionDate());
    this.isEditingMeta.set(true);
  }

  cancelMetaEdit(): void {
    this.isEditingMeta.set(false);
  }

  saveMetaEdit(): void {
    this.metaUpdated.emit({
      title: this.titleDraft().trim() || this.title(),
      sessionDate: this.dateDraft()
    });
    this.isEditingMeta.set(false);
  }

  onTitleDraftInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.titleDraft.set(target.value);
  }

  onDateDraftInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.dateDraft.set(target.value);
  }

  toggleEdit(): void {
    if (!this.canEditStory()) {
      return;
    }
    this.isEditing.set(!this.isEditing());
  }

  onDraftInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.draft.set(target.value);
  }

  resetDraft(): void {
    this.draft.set(this.story());
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
    const blob = new Blob([this.story() || ''], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${this.slugify(this.title() || 'session-story')}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  downloadPdf(): void {
    const html = `
      <html>
        <head>
          <title>${this.title()}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; line-height: 1.6; }
            h1, h2, h3 { margin-top: 24px; }
          </style>
        </head>
        <body>
          ${this.convertMarkdown(this.story())}
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
    if (!markdown) {
      return '';
    }
    return marked.parse(markdown, { async: false }) as string;
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }
}
