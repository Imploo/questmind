import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-loading',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh flex flex-col items-center justify-center gap-5 p-6 text-center" role="status">
      <span class="qm-spinner qm-spinner-lg qm-spinner-light" aria-hidden="true"></span>
      <div>
        <div class="qm-page-eyebrow">Loading</div>
        <h2 class="qm-page-title mt-1">Questmind</h2>
      </div>
    </div>
  `
})
export class LoadingComponent {}
