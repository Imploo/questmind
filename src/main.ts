import { bootstrapApplication } from '@angular/platform-browser';
import { SentryService } from './app/core/services/sentry.service';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Initialize Sentry before app bootstrap
SentryService.init();

// console.error is intentional here: if bootstrap fails, the app's logger (and its
// Sentry integration) may not be available yet, so fall back to the browser console.
bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
