import {
  ChangeDetectionStrategy,
  Component,
  SecurityContext,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { marked } from 'marked';
import { PodcastVersion } from './services/audio-session.models';
import { ToastService } from '../shared/services/toast.service';
import { PodcastVersionItemComponent } from '../shared/components/podcast-version-item.component';
import { I18nService } from '../core/i18n/i18n.service';
import { FormattingService } from '../shared/formatting.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';

export interface SessionMetaUpdate {
  title: string;
  sessionDate: string;
}

/** A story rewritten by hand, with the text the member started from. */
export interface SessionStoryEdit {
  content: string;
  baseContent: string;
}

@Component({
  selector: 'app-session-story',
  imports: [PodcastVersionItemComponent, TranslatePipe],
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
                [placeholder]="'audio.story.titleLabel' | translate"
                [attr.aria-label]="'audio.story.titleLabel' | translate"
              />
              <input
                type="date"
                class="qm-input !w-48 !text-sm"
                [value]="dateDraft()"
                (input)="onDateDraftInput($event)"
                [attr.aria-label]="'audio.story.dateLabel' | translate"
              />
            </div>
            <div class="flex gap-2 self-start">
              <button type="button" class="qm-btn qm-btn-sm" (click)="cancelMetaEdit()">
                {{ 'common.cancel' | translate }}
              </button>
              <button type="button" class="qm-btn qm-btn-sm qm-btn-primary" (click)="saveMetaEdit()">
                {{ 'common.save' | translate }}
              </button>
            </div>
          } @else {
            <div class="min-w-0">
              <div class="qm-eyebrow">{{ 'audio.story.eyebrow' | translate }}</div>
              <h3 class="qm-display text-xl sm:text-2xl leading-tight break-words">{{ title() }}</h3>
              <p class="text-sm qm-muted mt-0.5">{{ subtitle() }}</p>
            </div>
            <div class="flex gap-2 shrink-0">
              <button
                type="button"
                class="qm-btn qm-btn-sm"
                (click)="startMetaEdit()"
                [disabled]="isBusy() || !canManageSession()"
              >
                {{ 'audio.story.editDetails' | translate }}
              </button>
              <button
                type="button"
                class="qm-btn qm-btn-sm qm-btn-danger"
                (click)="onDeleteClick()"
                [disabled]="isBusy() || !canManageSession()"
                [title]="'audio.story.deleteSession' | translate"
                [attr.aria-label]="'audio.story.deleteSession' | translate"
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
            <span>{{ 'audio.story.tabStory' | translate }}</span>
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
            <span>{{ 'audio.story.tabPodcasts' | translate }}</span>
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
                  <h4 class="qm-section-title flex-1 !mb-0">{{ 'audio.story.generatedStory' | translate }}</h4>
                  @if (edited()) {
                    <span class="qm-badge" data-testid="story-edited">{{ 'audio.story.edited' | translate }}</span>
                  }
                  <button
                    type="button"
                    class="qm-btn qm-btn-sm"
                    (click)="toggleEdit()"
                    [disabled]="isBusy() || !canEditStory()"
                  >
                    {{ (isEditing() ? 'audio.story.preview' : 'audio.story.editStory') | translate }}
                  </button>
                </div>

                @if (otherEditors().length > 0) {
                  <p class="qm-alert qm-alert-info" role="status" data-testid="story-other-editors">
                    {{ 'storyEdit.othersEditing' | translate: otherEditorNames() : otherEditors().length }}
                  </p>
                }

                <div>
                  @if (isEditing()) {
                    @if (changedElsewhere()) {
                      <div class="qm-alert qm-alert-warn mb-3 space-y-2" role="alert" data-testid="story-conflict">
                        <p class="font-semibold">{{ conflictText() }}</p>
                        <p>{{ 'storyEdit.conflictHelp' | translate }}</p>
                        <details>
                          <summary class="cursor-pointer font-semibold">{{ 'storyEdit.showCurrent' | translate }}</summary>
                          <pre class="qm-well mt-2 max-h-80 overflow-auto text-xs whitespace-pre-wrap">{{ story() }}</pre>
                        </details>
                        <div class="flex flex-wrap gap-2">
                          <button
                            type="button"
                            class="qm-btn qm-btn-sm qm-btn-primary"
                            (click)="keepMine()"
                            [disabled]="isBusy() || saving() || !canEditStory() || !canSave()"
                            data-testid="story-keep-mine"
                          >
                            {{ 'storyEdit.keepMine' | translate }}
                          </button>
                          <button
                            type="button"
                            class="qm-btn qm-btn-sm"
                            (click)="resetDraft()"
                            [disabled]="saving()"
                            data-testid="story-load-current"
                          >
                            {{ 'storyEdit.loadCurrent' | translate }}
                          </button>
                        </div>
                      </div>
                    }
                    <textarea
                      class="qm-input min-h-[320px] !text-sm"
                      [value]="draft()"
                      (input)="onDraftInput($event)"
                      [disabled]="isBusy() || saving() || !canEditStory()"
                      [attr.aria-label]="'audio.story.tabStory' | translate"
                    ></textarea>
                    <p class="qm-help mt-2">{{ 'audio.story.editHelp' | translate }}</p>
                    @if (!changedElsewhere()) {
                      <div class="mt-3 flex justify-end gap-2">
                        <button
                          type="button"
                          class="qm-btn qm-btn-sm"
                          (click)="resetDraft()"
                          [disabled]="isBusy() || saving() || !canEditStory()"
                        >
                          {{ 'audio.story.reset' | translate }}
                        </button>
                        <button
                          type="button"
                          class="qm-btn qm-btn-sm qm-btn-primary"
                          (click)="saveDraft()"
                          [disabled]="isBusy() || saving() || !canEditStory() || !canSave()"
                        >
                          {{ 'audio.story.saveStory' | translate }}
                        </button>
                      </div>
                    }
                  } @else {
                    <div class="prose qm-prose max-w-none" [innerHTML]="renderedStory()"></div>
                  }
                </div>

                <div class="flex flex-wrap gap-2 pt-1">
                  <button type="button" class="qm-btn qm-btn-sm" (click)="downloadMarkdown()">
                    {{ 'audio.story.downloadMarkdown' | translate }}
                  </button>
                  <button type="button" class="qm-btn qm-btn-sm" (click)="downloadPdf()">
                    {{ 'audio.story.exportPdf' | translate }}
                  </button>
                </div>

                @if (transcript()) {
                  <div class="border-t border-dashed border-[#e0d2b6] pt-4">
                    <button type="button" class="qm-link text-sm" (click)="toggleTranscript()">
                      {{ (showTranscript() ? 'audio.story.hideTranscript' : 'audio.story.showTranscript') | translate }}
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
                  <h4 class="qm-section-title flex-1 !mb-0">{{ 'audio.corrections.title' | translate }}</h4>
                  @if (correctionsStatus() !== 'idle') {
                    <span class="text-xs qm-muted">
                      {{ (correctionsStatus() === 'saving' ? 'audio.corrections.saving' : 'audio.corrections.saved') | translate }}
                    </span>
                  }
                </div>

                <div class="qm-well space-y-3">
                  <p class="text-sm text-gray-700">
                    {{ 'audio.corrections.intro' | translate }}
                  </p>
                  <textarea
                    class="qm-input min-h-[240px] !text-sm resize-y font-mono"
                    [value]="corrections()"
                    (input)="onCorrectionsInput($event)"
                    [disabled]="isBusy() || !canEditCorrections()"
                    [attr.aria-label]="'audio.corrections.label' | translate"
                    [placeholder]="'audio.corrections.placeholder' | translate"
                  ></textarea>
                  <p class="qm-help">
                    {{ 'audio.corrections.help' | translate }}
                  </p>
                  <button
                    type="button"
                    class="qm-btn qm-btn-gold qm-btn-block"
                    (click)="onRegenerateClick()"
                    [disabled]="isBusy() || !canRegenerate()"
                  >
                    {{ 'audio.corrections.regenerate' | translate }}
                  </button>
                </div>
              </div>
            </div>
          } @else {
            <div class="rounded-xl border border-dashed border-[#d9c9a6] p-6 text-center font-prose text-lg text-gray-600">
              {{ 'audio.story.empty' | translate }}
            </div>
          }
        }

        <!-- Podcasts Tab -->
        @if (activeTab() === 'podcasts') {
          <div class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="min-w-0">
                <h4 class="font-display text-base font-bold">{{ 'podcast.session.title' | translate }}</h4>
                <p class="text-sm qm-muted mt-0.5">
                  {{ 'podcast.session.intro' | translate }}
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
                  {{ 'podcast.session.generate' | translate }}
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
                  {{ 'podcast.session.durationHint' | translate }}
                </p>
              </div>
            }

            @if (podcasts().length > 0) {
              <div class="space-y-3">
                <h5 class="qm-eyebrow">
                  {{ 'podcast.session.listTitle' | translate: podcasts().length }}
                </h5>
                @for (podcast of podcasts(); track podcast.version) {
                  <app-podcast-version-item
                    [podcast]="podcast"
                    [shareTarget]="campaignId() && sessionId() ? { campaignId: campaignId(), sessionId: sessionId(), podcastVersion: podcast.version } : null"
                    [downloadName]="title() || 'podcast'"
                    [canDelete]="canDeletePodcasts()"
                  />
                }
              </div>
            }

            @if (podcasts().length === 0 && !isGeneratingPodcast()) {
              <div class="rounded-xl border border-dashed border-[#d9c9a6] p-6 text-center">
                <p class="font-prose text-lg text-gray-700">
                  {{ 'podcast.session.empty' | translate }}
                </p>
                <p class="qm-help mt-1">
                  {{ 'podcast.session.voicesHint' | translate }}
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
  private readonly i18n = inject(I18nService);
  private readonly formatting = inject(FormattingService);

  /** Title of the session; the parent passes a translated default for a session without one. */
  title = input('');
  subtitle = input('');
  sessionDate = input('');
  story = input('');
  /** The story was edited by hand: it goes along when the story is regenerated. */
  edited = input(false);
  transcript = input('');
  isBusy = input(false);
  canRegenerate = input(false);
  /** Every member of the campaign can rewrite a finished story. */
  canEditStory = input(false);
  /** The session's own details and deleting it stay with its owner. */
  canManageSession = input(false);
  /** A save of the story is on its way to the database. */
  saving = input(false);
  /** Who last changed the story by hand, when that was someone else; '' when unknown. */
  changedBy = input('');
  /** Names of the other members who have the story open for editing right now. */
  otherEditors = input<string[]>([]);
  readonly otherEditorNames = computed(() => this.formatting.formatList(this.otherEditors()));
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
  /** The campaign owner may delete the session's podcasts. */
  canDeletePodcasts = input(false);

  /** The member saves the story; the parent closes the edit form (`isEditing`) once it is stored. */
  storyUpdated = output<SessionStoryEdit>();
  /** With the edit that still has to be saved first, or null when there is none. */
  regenerate = output<SessionStoryEdit | null>();
  correctionsChanged = output<string>();
  generatePodcast = output<void>();
  metaUpdated = output<SessionMetaUpdate>();
  deleteSession = output<void>();

  activeTab = signal<'story' | 'podcasts'>('story');
  /** The edit form is open. The parent closes it after a save, and shares it with the other members. */
  isEditing = model<boolean>(false);
  isEditingMeta = signal<boolean>(false);
  titleDraft = signal<string>('');
  dateDraft = signal<string>('');
  draft = signal<string>('');
  /** The stored story the draft started from. */
  private readonly base = signal<string>('');
  private shownSessionId: string | undefined;
  showTranscript = signal<boolean>(false);

  readonly renderedStory = computed(
    () => this.sanitizer.sanitize(SecurityContext.HTML, this.convertMarkdown(this.story())) ?? ''
  );
  /** The member typed something that is not stored yet. */
  readonly hasUnsavedEdits = computed(() => this.draft() !== this.base());
  /**
   * The stored story is no longer the one the draft started from: someone else
   * saved, or the story was regenerated, while this member was typing.
   */
  readonly changedElsewhere = computed(() => this.story() !== this.base());
  readonly canSave = computed(() => this.draft().trim().length > 0);
  readonly conflictText = computed(() => {
    const texts = this.i18n.t().storyEdit;
    const name = this.changedBy();
    return name ? texts.changedBy(name) : texts.changedBySomeone;
  });

  constructor() {
    // Configure marked options
    marked.setOptions({
      breaks: true,
      gfm: true
    });

    // The draft follows the stored story, except while it holds text that is not
    // saved yet: then it is left alone and the form says the story has changed.
    effect(() => {
      const story = this.story();
      const sessionId = this.sessionId();
      untracked(() => {
        const otherSession = sessionId !== this.shownSessionId;
        this.shownSessionId = sessionId;
        if (otherSession || !this.hasUnsavedEdits() || story === this.draft()) {
          this.base.set(story);
          this.draft.set(story);
        }
        if (otherSession) {
          this.isEditing.set(false);
        }
      });
    });
  }

  async onDeleteClick(): Promise<void> {
    const confirmed = await this.toastService.confirm(this.i18n.t().audio.story.deleteConfirm);
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

  /** Drop what was typed and start again from the stored story. */
  resetDraft(): void {
    this.base.set(this.story());
    this.draft.set(this.story());
  }

  saveDraft(): void {
    if (!this.hasUnsavedEdits()) {
      this.isEditing.set(false);
      return;
    }
    this.storyUpdated.emit({ content: this.draft(), baseContent: this.base() });
  }

  /** After the story changed elsewhere: save this member's text over the current story. */
  keepMine(): void {
    this.base.set(this.story());
    this.saveDraft();
  }

  /** Edits that are still in the text field are saved first: the regeneration starts from them. */
  onRegenerateClick(): void {
    const unsaved = this.canEditStory() && this.hasUnsavedEdits() && this.canSave();
    this.regenerate.emit(unsaved ? { content: this.draft(), baseContent: this.base() } : null);
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
