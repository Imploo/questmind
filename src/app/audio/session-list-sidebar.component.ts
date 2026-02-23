import { Component, ChangeDetectionStrategy, input, output, signal } from '@angular/core';
import { AudioSessionRecord } from './services/audio-session.models';

@Component({
  selector: 'app-session-list-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Mobile: Toggle button at top -->
    <div class="lg:hidden">
      <button
        type="button"
        (click)="mobileDrawerOpen.set(true)"
        class="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl shadow-sm flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div class="flex items-center gap-3">
          <span class="text-lg">📋</span>
          <div class="text-left">
            <p class="m-0 text-sm font-semibold text-gray-700">
              {{ mobileLabel() }}
            </p>
            <p class="m-0 text-xs text-gray-500">
              {{ sessions().length }} session(s) available
            </p>
          </div>
        </div>
        <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
        </svg>
      </button>
    </div>

    <!-- Mobile backdrop -->
    @if (mobileDrawerOpen()) {
      <div
        class="fixed inset-0 bg-black/50 z-40 lg:hidden"
        (click)="mobileDrawerOpen.set(false)"
      ></div>
    }

    <!-- Sidebar: sticky on desktop, drawer on mobile -->
    <aside
      class="flex-shrink-0 lg:w-72 lg:sticky lg:top-4 lg:self-start lg:h-[calc(100vh-8rem)]"
      [class.fixed]="mobileDrawerOpen()"
      [class.inset-0]="mobileDrawerOpen()"
      [class.flex]="mobileDrawerOpen()"
      [class.items-center]="mobileDrawerOpen()"
      [class.justify-center]="mobileDrawerOpen()"
      [class.z-50]="mobileDrawerOpen()"
      [class.p-4]="mobileDrawerOpen()"
      [class.hidden]="!mobileDrawerOpen()"
      [class.lg:block]="true"
    >
      <div
        class="border border-gray-200 rounded-xl bg-white shadow-sm flex flex-col overflow-hidden h-full"
        [class.w-full]="mobileDrawerOpen()"
        [class.max-w-md]="mobileDrawerOpen()"
        [class.max-h-[85vh]]="mobileDrawerOpen()"
        [class.shadow-2xl]="mobileDrawerOpen()"
      >
        <div class="p-4 border-b border-gray-200">
          <div class="flex items-center justify-between mb-3">
            <div>
              <h3 class="text-sm font-semibold text-gray-700 m-0">Sessions</h3>
              <p class="text-xs text-gray-500 m-0 mt-1">{{ sessions().length }} session(s)</p>
            </div>
            <!-- Close button for mobile -->
            <button
              type="button"
              (click)="mobileDrawerOpen.set(false)"
              class="lg:hidden p-1 hover:bg-gray-100 rounded transition-colors"
              aria-label="Close session list"
            >
              <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          @if (showNewButton()) {
            <button
              type="button"
              (click)="newRequested.emit(); mobileDrawerOpen.set(false)"
              class="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
              </svg>
              New Session
            </button>
          } @else {
            <div class="w-full px-4 py-2 bg-primary/10 border border-primary rounded-lg flex items-center justify-center gap-2 text-sm font-medium text-primary">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
              </svg>
              New Session (Active)
            </div>
          }
        </div>
        <div class="flex-1 overflow-y-auto">
          @if (sessions().length === 0) {
            <div class="p-4 text-center">
              <p class="text-sm text-gray-500 m-0">No sessions yet.</p>
              <p class="text-xs text-gray-400 m-0 mt-1">
                {{ showNewButton() ? 'Upload audio to begin.' : 'This will be your first!' }}
              </p>
            </div>
          } @else {
            <nav class="p-2 flex flex-col gap-1" aria-label="Session list">
              @for (session of sessions(); track session.id) {
                <button
                  type="button"
                  class="text-left w-full rounded-lg p-3 transition-colors"
                  [class.bg-primary/10]="currentSessionId() === session.id"
                  [class.border-primary]="currentSessionId() === session.id"
                  [class.border]="currentSessionId() === session.id"
                  [class.hover:bg-gray-50]="currentSessionId() !== session.id"
                  [attr.aria-current]="currentSessionId() === session.id ? 'true' : null"
                  (click)="sessionSelected.emit(session); mobileDrawerOpen.set(false)"
                >
                  <p class="m-0 text-sm font-medium text-gray-800 truncate">{{ session.title }}</p>
                  <p class="m-0 text-xs text-gray-500 mt-0.5">
                    {{ session.sessionDate || 'No date' }}
                  </p>
                  <div class="flex items-center gap-2 mt-1">
                    <span
                      class="inline-block w-2 h-2 rounded-full"
                      [class.bg-green-500]="session.status === 'completed'"
                      [class.bg-yellow-500]="session.status === 'processing' || session.status === 'uploading'"
                      [class.bg-red-500]="session.status === 'failed'"
                    ></span>
                    <span class="text-xs text-gray-400">{{ session.status }}</span>
                    @if (session.ownerId === userId()) {
                      <span class="text-xs text-primary font-medium ml-auto">You</span>
                    }
                  </div>
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
  mobileLabel = input('Select a session');
  showNewButton = input(true);

  sessionSelected = output<AudioSessionRecord>();
  newRequested = output<void>();

  mobileDrawerOpen = signal(false);
}
