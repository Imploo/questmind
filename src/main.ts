import { bootstrapApplication } from '@angular/platform-browser';
import { SentryService } from './app/core/services/sentry.service';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Initialize Sentry before app bootstrap
SentryService.init();

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
