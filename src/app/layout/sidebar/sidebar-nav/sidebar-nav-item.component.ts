import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ChatBubbleLeftRightOutlineIconComponent,
  ChatBubbleLeftRightSolidIconComponent,
  MicrophoneOutlineIconComponent,
  MicrophoneSolidIconComponent,
  MusicalNoteOutlineIconComponent,
  MusicalNoteSolidIconComponent,
  Cog6ToothOutlineIconComponent,
  Cog6ToothSolidIconComponent,
} from '@dimaslz/ng-heroicons';
import { NavItem } from '../../nav-item.model';

@Component({
  selector: 'app-sidebar-nav-item',
  imports: [
    RouterLink,
    ChatBubbleLeftRightOutlineIconComponent,
    ChatBubbleLeftRightSolidIconComponent,
    MicrophoneOutlineIconComponent,
    MicrophoneSolidIconComponent,
    MusicalNoteOutlineIconComponent,
    MusicalNoteSolidIconComponent,
    Cog6ToothOutlineIconComponent,
    Cog6ToothSolidIconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      [routerLink]="item().route"
      [class]="itemClasses()"
      [title]="isCollapsed() ? item().label : ''"
    >
      <span class="shrink-0">
        @switch (item().icon) {
          @case ('chat-bubble-left-right') {
            @if (isActive()) {
              <chat-bubble-left-right-solid-icon [size]="iconSize()" />
            } @else {
              <chat-bubble-left-right-outline-icon [size]="iconSize()" />
            }
          }
          @case ('microphone') {
            @if (isActive()) {
              <microphone-solid-icon [size]="iconSize()" />
            } @else {
              <microphone-outline-icon [size]="iconSize()" />
            }
          }
          @case ('musical-note') {
            @if (isActive()) {
              <musical-note-solid-icon [size]="iconSize()" />
            } @else {
              <musical-note-outline-icon [size]="iconSize()" />
            }
          }
          @case ('cog6-tooth') {
            @if (isActive()) {
              <cog-6-tooth-solid-icon [size]="iconSize()" />
            } @else {
              <cog-6-tooth-outline-icon [size]="iconSize()" />
            }
          }
        }
      </span>
      @if (!isCollapsed()) {
        <span>{{ item().label }}</span>
      }
    </a>
  `
})
export class SidebarNavItemComponent {
  readonly item = input.required<NavItem>();
  readonly isActive = input.required<boolean>();
  readonly isCollapsed = input.required<boolean>();

  readonly itemClasses = computed(() => {
    const base = 'flex items-center rounded-xl text-sm font-semibold transition-colors cursor-pointer';
    const layout = this.isCollapsed() ? 'justify-center p-3 mx-2' : 'gap-3 px-4 py-3 mx-3';
    const active = this.isActive()
      ? 'bg-primary text-white shadow'
      : 'text-gray-600 hover:bg-gray-100';

    return `${base} ${layout} ${active}`;
  });

  readonly iconSize = computed(() => {
    return this.isCollapsed() ? 24 : 20;
  });
}
