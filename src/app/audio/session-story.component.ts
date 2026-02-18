import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { marked } from 'marked';
import { PodcastVersion } from './services/audio-session.models';
import { FormattingService } from '../shared/formatting.service';

@Component({
  selector: 'app-session-story',
  standalone: true,
  imports: [CommonModule, MatProgressBarModule],
  template: `
    <div class="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden relative">
      <!-- Background Job Loader Overlay -->
      @if (hasActiveBackgroundJob) {
        <div class="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div class="max-w-md text-center">
            <div class="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
              <svg class="animate-spin h-8 w-8 text-blue-600" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <h3 class="text-lg font-semibold text-gray-800 mb-2">Processing in Background</h3>
            <p class="text-sm text-gray-600">{{ backgroundJobMessage }}</p>
            <p class="text-xs text-gray-500 mt-3">This may take a few minutes. You can leave this page and come back later.</p>
          </div>
        </div>
      }

      <!-- Card Header -->
      <div class="p-6 pb-0">
        <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-4">
          <div>
            <h3 class="text-lg font-semibold m-0">{{ title }}</h3>
            <p class="text-sm text-gray-500 m-0">{{ subtitle }}</p>
          </div>
          <div class="flex gap-2">
            @if (activeTab() === 'story') {
              <button
                type="button"
                class="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:text-gray-800"
                (click)="toggleEdit()"
                [disabled]="isBusy || !story.trim().length || !canEditStory"
              >
                {{ isEditing() ? 'Preview' : 'Edit' }}
              </button>
            }
          </div>
        </div>

        <!-- Tabs -->
        <div class="flex gap-1 border-b border-gray-200">
          <button
            type="button"
            class="px-4 py-3 text-sm font-medium transition-colors relative flex items-center gap-2"
            [class.text-primary]="activeTab() === 'story'"
            [class.text-gray-600]="activeTab() !== 'story'"
            [class.hover:text-gray-800]="activeTab() !== 'story'"
            (click)="activeTab.set('story')"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
            </svg>
            <span>Story</span>
            @if (activeTab() === 'story') {
              <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></div>
            }
          </button>
          <button
            type="button"
            class="px-4 py-3 text-sm font-medium transition-colors relative flex items-center gap-2"
            [class.text-primary]="activeTab() === 'podcasts'"
            [class.text-gray-600]="activeTab() !== 'podcasts'"
            [class.hover:text-gray-800]="activeTab() !== 'podcasts'"
            (click)="activeTab.set('podcasts')"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
            </svg>
            <span>Podcasts</span>
            @if (podcasts.length > 0) {
              <span class="ml-1 px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full">
                {{ podcasts.length }}
              </span>
            }
            @if (activeTab() === 'podcasts') {
              <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></div>
            }
          </button>
        </div>
      </div>

      <!-- Tab Content -->
      <div class="p-6">
        <!-- Story Tab -->
        @if (activeTab() === 'story') {
          @if (story.trim().length || isRegenerating) {
            <div class="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div class="space-y-4">
                @if (isRegenerating) {
                  <h4 class="text-base font-semibold m-0">Regenerating Story</h4>
                  <div class="border border-gray-200 rounded-lg p-8 flex flex-col items-center justify-center min-h-[220px]">
                    <mat-progress-bar mode="indeterminate" class="w-full max-w-xs"></mat-progress-bar>
                    <p class="text-sm text-gray-500 m-0 mt-4">{{ regenerationMessage || 'Regenerating story...' }}</p>
                  </div>
                } @else {
                  <div class="flex items-center justify-between">
                    <h4 class="text-base font-semibold m-0">Generated Story</h4>
                    <button
                      type="button"
                      class="px-3 py-2 text-xs font-semibold rounded-lg bg-primary text-white hover:bg-primary-dark disabled:bg-gray-300"
                      (click)="regenerate.emit()"
                      [disabled]="isBusy || !canRegenerate"
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
                        [disabled]="isBusy || !canEditStory"
                      ></textarea>
                      <div class="mt-3 flex justify-end gap-2">
                        <button
                          type="button"
                          class="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:text-gray-800"
                          (click)="resetDraft()"
                        [disabled]="isBusy || !canEditStory"
                        >
                          Reset
                        </button>
                        <button
                          type="button"
                          class="px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-300"
                          (click)="saveDraft()"
                        [disabled]="isBusy || !canEditStory"
                        >
                          Save Story
                        </button>
                      </div>
                    } @else {
                      <div class="prose prose-gray max-w-none" [innerHTML]="renderedStory()"></div>
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
                    [disabled]="isBusy || !canEditCorrections"
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
        }

        <!-- Podcasts Tab -->
        @if (activeTab() === 'podcasts') {
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <h4 class="text-base font-semibold text-purple-900 m-0">Session Podcast</h4>
                <p class="text-sm text-purple-700 m-0 mt-1">
                  Genereer een boeiende audio recap met twee hosts die de sessie bespreken
                </p>
              </div>
              <button
                (click)="generatePodcast.emit()"
                [disabled]="isGeneratingPodcast || isBusy || !canGeneratePodcast"
                class="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                @if (isGeneratingPodcast) {
                  <span class="flex items-center gap-2">
                    <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>{{ podcastGenerationProgress }}</span>
                  </span>
                } @else {
                  Genereer Podcast
                }
              </button>
            </div>

            @if (podcastError) {
              <div class="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p class="text-sm text-red-700 m-0">{{ podcastError }}</p>
              </div>
            }

            @if (isGeneratingPodcast) {
              <div class="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-sm font-medium text-blue-900">{{ podcastGenerationProgress }}</span>
                  <span class="text-sm text-blue-700">{{ podcastGenerationProgressPercent }}%</span>
                </div>
                <div class="w-full bg-blue-200 rounded-full h-2">
                  <div
                    class="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    [style.width.%]="podcastGenerationProgressPercent"
                  ></div>
                </div>
                <p class="text-xs text-blue-600 mt-2">
                  Dit kan 2-3 minuten duren. De complete MP3 wordt gegenereerd en opgeslagen.
                </p>
              </div>
            }

            @if (podcasts.length > 0) {
              <div class="space-y-3">
                <h5 class="text-sm font-medium text-purple-900 m-0">
                  Gegenereerde Podcasts ({{ podcasts.length }})
                </h5>
                @for (podcast of podcasts; track podcast.version) {
                  <div class="flex items-center gap-4 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-100 hover:border-purple-300 transition-colors">
                    <div class="flex-shrink-0">
                      <span class="inline-flex items-center justify-center w-10 h-10 bg-purple-600 text-white rounded-full font-semibold text-sm">
                        v{{ podcast.version }}
                      </span>
                    </div>

                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-gray-900">
                          Podcast v{{ podcast.version }}
                        </span>
                        @if (podcast.status === 'pending' || podcast.status === 'generating_audio' || podcast.status === 'uploading') {
                          <span class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">{{ podcast.progressMessage || 'Generating...' }}</span>
                        } @else if (podcast.status === 'failed') {
                          <span class="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">Failed</span>
                        } @else if (podcast.status === 'completed') {
                          <span class="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                            {{ podcast.audioUrl ? 'Audio Ready' : 'Audio Pending' }}
                          </span>
                        }
                      </div>
                      <div class="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        <span>{{ formatting.formatDuration(podcast.duration) }}</span>
                        @if (podcast.fileSize) {
                          <span>•</span>
                          <span>{{ formatting.formatFileSize(podcast.fileSize) }}</span>
                        }
                        <span>•</span>
                        <span>{{ formatting.formatDate(podcast.createdAt) }}</span>
                      </div>
                    </div>

                    <div class="flex items-center gap-2">
                      <button
                        (click)="downloadPodcast.emit(podcast)"
                        [disabled]="!podcast.audioUrl"
                        class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                        title="Podcast downloaden"
                      >
                        ⬇️ Download
                      </button>
                    </div>
                  </div>

                  <!-- Native HTML5 Audio Player -->
                  @if (podcast.audioUrl) {
                    <div class="mt-3 bg-white rounded-lg p-3 border border-purple-200">
                      <audio
                        controls
                        [src]="podcast.audioUrl"
                        class="w-full"
                        preload="metadata"
                      >
                        Je browser ondersteunt het audio element niet.
                      </audio>
                    </div>
                  }
                }
              </div>
            }

            @if (podcasts.length === 0 && !isGeneratingPodcast) {
              <div class="p-4 bg-white rounded-lg border border-purple-100 text-center">
                <p class="text-sm text-gray-500 m-0">
                  Nog geen podcasts gegenereerd. Klik op "Genereer Podcast" om te beginnen.
                </p>
                <p class="text-xs text-gray-400 m-0 mt-1">
                  Podcasts gebruiken Gemini 2.5 Flash TTS met natuurlijk klinkende Nederlandse stemmen
                </p>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `
})
export class SessionStoryComponent implements OnChanges {
  private readonly sanitizer = inject(DomSanitizer);
  public readonly formatting = inject(FormattingService);

  @Input() title = 'Session Story';
  @Input() subtitle = '';
  @Input() story = '';
  @Input() transcript = '';
  @Input() isBusy = false;
  @Input() canRegenerate = false;
  @Input() canEditStory = false;
  @Input() canEditCorrections = true;
  @Input() corrections = '';
  @Input() correctionsStatus: 'idle' | 'saving' | 'saved' = 'idle';
  
  // Podcast inputs
  @Input() podcasts: PodcastVersion[] = [];
  @Input() isGeneratingPodcast = false;
  @Input() podcastGenerationProgress = '';
  @Input() podcastGenerationProgressPercent = 0;
  @Input() podcastError = '';
  @Input() canGeneratePodcast = false;

  // Regeneration state
  @Input() isRegenerating = false;
  @Input() regenerationMessage = '';

  // Background job tracking
  @Input() hasActiveBackgroundJob = false;
  @Input() backgroundJobMessage = '';
  
  @Output() storyUpdated = new EventEmitter<string>();
  @Output() regenerate = new EventEmitter<void>();
  @Output() correctionsChanged = new EventEmitter<string>();
  @Output() generatePodcast = new EventEmitter<void>();
  @Output() downloadPodcast = new EventEmitter<PodcastVersion>();

  activeTab = signal<'story' | 'podcasts'>('story');
  isEditing = signal<boolean>(false);
  draft = signal<string>('');
  renderedStory = signal<SafeHtml>('');
  showTranscript = signal<boolean>(false);

  constructor() {
    // Configure marked options
    marked.setOptions({
      breaks: true,
      gfm: true
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['story']) {
      this.draft.set(this.story);
      this.renderedStory.set(this.sanitizer.bypassSecurityTrustHtml(this.convertMarkdown(this.story)));
    }
  }

  toggleEdit(): void {
    if (!this.canEditStory) {
      return;
    }
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
