import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './auth/auth.service';
import { LoadingComponent } from './loading.component';
import { UpdateService } from './core/update.service';
import { ToastContainerComponent } from './shared/components/toast-container/toast-container.component';
import { TranslatePipe } from './core/i18n/translate.pipe';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LoadingComponent, ToastContainerComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  protected authService = inject(AuthService);
  protected isLoading = this.authService.isLoading;
  protected updateService = inject(UpdateService);
  protected updateAvailable = this.updateService.updateAvailable;

  ngOnInit(): void {
    void this.updateService.init();
  }

  reload(): void {
    this.updateService.reload();
  }
}
