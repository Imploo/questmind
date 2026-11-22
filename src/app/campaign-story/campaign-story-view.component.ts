import {
  ChangeDetectionStrategy,
  Component,
  SecurityContext,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { marked } from 'marked';
import { FormattingService } from '../shared/formatting.service';
import { CampaignStoryEdit, CampaignStoryVersion } from './campaign-story.models';
import { sourceCountText } from './campaign-story.utils';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';

/** Longest title the Firestore rules accept. */
const MAX_TITLE_LENGTH = 200;

/**
 * Renders one campaign story version (ticket #69). In edit mode the owner
 * rewrites the title and the text by hand; the parent saves what is emitted.
 */
@Component({
  selector: 'app-campaign-story-view',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="qm-panel qm-hero sm:!p-9">
      @if (!isLatest()) {
        <div class="qm-alert qm-alert-warn relative z-[1] mb-5 flex flex-wrap items-center gap-3">
          <span class="qm-badge">{{ 'campaignStory.olderVersion' | translate }}</span>
          <span>{{ 'campaignStory.viewingVersion' | translate: version().version }}</span>
          <button type="button" class="font-semibold underline underline-offset-2 hover:no-underline" (click)="backToLatest.emit()">
            {{ 'campaignStory.backToLatest' | translate }}
          </button>
        </div>
      }

      @if (editing()) {
        <form class="relative z-[1] space-y-3" (submit)="save($event)" data-testid="story-edit-form">
          <div class="qm-eyebrow text-center">{{ meta() }}</div>
          <input
            type="text"
            class="qm-input font-display !text-lg font-bold"
            [value]="titleDraft()"
            (input)="onTitleInput($event)"
            [disabled]="saving()"
            [attr.maxlength]="maxTitleLength"
            [placeholder]="'campaignStory.untitled' | translate"
            [attr.aria-label]="'campaignStory.edit.titleLabel' | translate"
            data-testid="story-edit-title"
          />
          <textarea
            class="qm-input min-h-[60vh] !text-sm resize-y"
            [value]="contentDraft()"
            (input)="onContentInput($event)"
            [disabled]="saving()"
            [attr.aria-label]="'campaignStory.edit.contentLabel' | translate"
            data-testid="story-edit-content"
          ></textarea>
          <p class="qm-help">{{ 'campaignStory.edit.help' | translate }}</p>
          <div class="flex flex-wrap justify-end gap-2">
            <button type="button" class="qm-btn" [disabled]="saving()" (click)="cancelled.emit()">
              {{ 'common.cancel' | translate }}
            </button>
            <button type="submit" class="qm-btn qm-btn-primary" [disabled]="saving() || !canSave()" data-testid="story-edit-save">
              @if (saving()) {
                <span class="qm-spinner qm-spinner-light" aria-hidden="true"></span>
              }
              {{ 'campaignStory.edit.save' | translate }}
            </button>
          </div>
        </form>
      } @else {
        <header class="mb-6 text-center">
          <div class="qm-eyebrow">{{ meta() }}</div>
          <h2 class="qm-display text-2xl sm:text-3xl leading-tight mt-1.5">{{ version().title || ('campaignStory.untitled' | translate) }}</h2>
          <div class="flourish" aria-hidden="true"><span></span></div>
        </header>

        <div class="prose qm-prose qm-dropcap max-w-none" [innerHTML]="renderedContent()"></div>
      }
    </article>
  `,
  styles: [`
    .flourish {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      margin-top: 1rem;
    }
    .flourish::before, .flourish::after { content: ''; width: 5rem; height: 1px; }
    .flourish::before { background: linear-gradient(to left, var(--gold), transparent); }
    .flourish::after { background: linear-gradient(to right, var(--gold), transparent); }
    .flourish > span { width: 7px; height: 7px; background: var(--gold); transform: rotate(45deg); }
  `]
})
export class CampaignStoryViewComponent {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly formatting = inject(FormattingService);
  private readonly i18n = inject(I18nService);

  readonly version = input.required<CampaignStoryVersion>();
  readonly isLatest = input(true);
  /** The owner is rewriting this version by hand. */
  readonly editing = input(false);
  /** The edit is on its way to the database. */
  readonly saving = input(false);

  readonly backToLatest = output<void>();
  readonly saved = output<CampaignStoryEdit>();
  readonly cancelled = output<void>();

  protected readonly maxTitleLength = MAX_TITLE_LENGTH;
  protected readonly titleDraft = signal('');
  protected readonly contentDraft = signal('');
  protected readonly canSave = computed(() => this.contentDraft().trim().length > 0);

  constructor() {
    // The drafts start from the version when editing begins. An update of the
    // version while editing (e.g. podcast progress) leaves what was typed alone.
    effect(() => {
      if (!this.editing()) return;
      const version = untracked(this.version);
      this.titleDraft.set(version.title ?? '');
      this.contentDraft.set(version.content ?? '');
    });
  }

  readonly meta = computed(() => {
    const version = this.version();
    const t = this.i18n.t();
    return [
      t.common.version(version.version),
      this.formatting.formatDate(version.completedAt ?? version.createdAt),
      sourceCountText(version, t),
      version.editedAt ? t.campaignStory.edited : '',
    ].filter(Boolean).join(' · ');
  });

  readonly renderedContent = computed(() => {
    const html = marked.parse(this.version().content ?? '', { async: false, breaks: true, gfm: true }) as string;
    return this.sanitizer.sanitize(SecurityContext.HTML, html) ?? '';
  });

  protected onTitleInput(event: Event): void {
    this.titleDraft.set((event.target as HTMLInputElement).value);
  }

  protected onContentInput(event: Event): void {
    this.contentDraft.set((event.target as HTMLTextAreaElement).value);
  }

  protected save(event: Event): void {
    event.preventDefault();
    if (!this.canSave() || this.saving()) return;
    this.saved.emit({ title: this.titleDraft().trim(), content: this.contentDraft().trim() });
  }
}
