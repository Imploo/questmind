import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LogoComponent } from './shared/components/logo.component';

@Component({
  selector: 'app-loading',
  imports: [LogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh flex flex-col items-center justify-center gap-4 p-6 text-center" role="status">
      <app-logo [size]="88" class="animate-pulse" />
      <div>
        <h2 class="qm-page-title">Questmind</h2>
        <div class="qm-page-eyebrow mt-1">Loading</div>
      </div>
    </div>
  `
})
export class LoadingComponent {}
