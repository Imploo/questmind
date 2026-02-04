import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { ChevronLeftOutlineIconComponent, ChevronRightOutlineIconComponent } from '@dimaslz/ng-heroicons';
import { CampaignSelectorComponent } from '../../../campaign/campaign-selector.component';

@Component({
  selector: 'app-sidebar-header',
  imports: [ChevronLeftOutlineIconComponent, ChevronRightOutlineIconComponent, CampaignSelectorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Expanded Layout -->
    @if (!isCollapsed()) {
      <div class="px-3 py-3">
        <!-- Toggle Button -->
        <div class="flex justify-end mb-3">
          <button
            (click)="toggleCollapse.emit()"
            class="p-1.5 rounded hover:bg-gray-100 transition-colors"
            [attr.aria-label]="'Collapse sidebar'"
            [title]="'Collapse sidebar'"
          >
            <chevron-left-outline-icon [size]="16" class="text-gray-600" />
          </button>
        </div>

        <!-- Campaign Selector -->
        <app-campaign-selector [isCollapsed]="false" />
      </div>
    }

    <!-- Collapsed Layout -->
    @if (isCollapsed()) {
      <div class="flex flex-col items-center py-3 gap-2">
        <!-- Toggle Button -->
        <button
          (click)="toggleCollapse.emit()"
          class="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          [attr.aria-label]="'Expand sidebar'"
          [title]="'Expand sidebar'"
        >
          <chevron-right-outline-icon [size]="20" class="text-gray-600" />
        </button>

        <!-- Campaign Selector -->
        <app-campaign-selector [isCollapsed]="true" />
      </div>
    }
  `
})
export class SidebarHeaderComponent {
  readonly isCollapsed = input.required<boolean>();
  readonly toggleCollapse = output<void>();
}
