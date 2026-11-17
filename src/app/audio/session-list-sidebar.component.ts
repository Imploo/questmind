import { Component, ChangeDetectionStrategy, inject, input, output, signal } from '@angular/core';
import { AudioSessionRecord } from './services/audio-session.models';
import { FormattingService } from '../shared/formatting.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';

@Component({
  selector: 'app-session-list-sidebar',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Mobile: Toggle button at top -->
    <div class="lg:hidden">
      <button
        type="button"
        (click)="mobileDrawerOpen.set(true)"
        class="qm-panel !py-3 w-full flex items-center justify-between gap-3 text-left"
      >
        <span class="flex min-w-0 items-center gap-3">
          <span class="qm-medallion qm-medallion-sm">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h10" /></svg>
          </span>
          <span class="min-w-0">
            <span class="block truncate font-display text-sm font-bold">{{ mobileLabel() || ('audio.selectSession' | translate) }}</span>
            <span class="block text-xs qm-muted">{{ 'audio.list.sessionsAvailable' | translate: sessions().length }}</span>
          </span>
        </span>
        <svg class="w-5 h-5 shrink-0 text-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
        </svg>
      </button>
    </div>

    <!-- Mobile backdrop -->
    @if (mobileDrawerOpen()) {
      <div
        class="qm-scrim !z-40 lg:hidden"
        (click)="mobileDrawerOpen.set(false)"
      ></div>
    }

    <!-- Sidebar: sticky on desktop, drawer on mobile -->
    <aside
      class="flex-shrink-0 lg:w-72 lg:sticky lg:top-6 lg:self-start lg:flex-col lg:max-h-[calc(100dvh-3rem)]"
      [class.fixed]="mobileDrawerOpen()"
      [class.inset-0]="mobileDrawerOpen()"
      [class.flex]="mobileDrawerOpen()"
      [class.items-center]="mobileDrawerOpen()"
      [class.justify-center]="mobileDrawerOpen()"
      [class.z-50]="mobileDrawerOpen()"
      [class.p-4]="mobileDrawerOpen()"
      [class.hidden]="!mobileDrawerOpen()"
      [class.lg:flex]="true"
    >
      <div
        class="qm-panel !p-0 flex flex-col overflow-hidden min-h-0"
        [class.w-full]="mobileDrawerOpen()"
        [class.max-w-md]="mobileDrawerOpen()"
        [class.max-h-[85vh]]="mobileDrawerOpen()"
      >
        <div class="p-4 border-b border-line">
          <div class="flex items-start justify-between gap-2">
            <h3 class="qm-section-title flex-1 !mb-0">{{ 'audio.list.title' | translate }}</h3>
            <span class="qm-badge qm-badge-quiet">{{ 'audio.list.sessionCount' | translate: sessions().length }}</span>
            <!-- Close button for mobile -->
            <button
              type="button"
              (click)="mobileDrawerOpen.set(false)"
              class="lg:hidden -my-1 -mr-1 p-1 rounded text-gray-500 hover:bg-paper-2 transition-colors"
              [attr.aria-label]="'audio.list.close' | translate"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          @if (showNewButton()) {
            <button
              type="button"
              (click)="newRequested.emit(); mobileDrawerOpen.set(false)"
              class="qm-btn qm-btn-primary qm-btn-block mt-3"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
              </svg>
              {{ 'audio.list.newSession' | translate }}
            </button>
          } @else {
            <div class="qm-item is-active mt-3 flex items-center gap-2 text-sm font-semibold" aria-current="true">
              <svg class="w-4 h-4 text-gold-deep" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
              </svg>
              {{ 'audio.list.newSession' | translate }}
            </div>
          }
        </div>
        <div class="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
          @if (sessions().length === 0) {
            <div class="p-5 text-center">
              <p class="font-prose text-base text-gray-700">{{ 'audio.list.empty' | translate }}</p>
              <p class="qm-help mt-1">
                {{ (showNewButton() ? 'audio.list.emptyHintUpload' : 'audio.list.emptyHintFirst') | translate }}
              </p>
            </div>
          } @else {
            <nav class="p-2 flex flex-col gap-1" [attr.aria-label]="'audio.list.ariaLabel' | translate">
              @for (session of sessions(); track session.id) {
                <button
                  type="button"
                  class="qm-item"
                  [class.is-active]="currentSessionId() === session.id"
                  [attr.aria-current]="currentSessionId() === session.id ? 'true' : null"
                  (click)="sessionSelected.emit(session); mobileDrawerOpen.set(false)"
                >
                  <span class="block text-sm font-semibold truncate">{{ session.title }}</span>
                  <span class="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                    <span class="text-xs qm-muted">{{ formatting.formatDay(session.sessionDate) || ('audio.noDate' | translate) }}</span>
                    <!-- A finished session is the normal case: only the others say so. -->
                    @if (session.status === 'failed') {
                      <span class="qm-badge qm-badge-danger">{{ 'common.failed' | translate }}</span>
                    } @else if (session.status !== 'completed') {
                      <span class="qm-badge qm-badge-info"><span class="qm-dot qm-dot-busy !h-1.5 !w-1.5 !shadow-none"></span>{{ (session.status === 'uploading' ? 'audio.list.statusUploading' : 'audio.list.statusProcessing') | translate }}</span>
                    }
                    @if (session.ownerId === userId()) {
                      <span class="qm-badge qm-badge-quiet ml-auto">{{ 'audio.list.you' | translate }}</span>
                    }
                  </span>
                </button>
              }
            </nav>
          }
        </div>
      </div>
    </aside>
  `
})
export class SessionListSidebarComponent {
  sessions = input.required<AudioSessionRecord[]>();
  currentSessionId = input<string | null>(null);
  userId = input<string | null>(null);
  /** Label of the mobile toggle; without one it invites to select a session. */
  mobileLabel = input('');
  showNewButton = input(true);

  sessionSelected = output<AudioSessionRecord>();
  newRequested = output<void>();

  mobileDrawerOpen = signal(false);
  protected readonly formatting = inject(FormattingService);
}
