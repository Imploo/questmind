import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection, APP_INITIALIZER, importProvidersFrom, inject, provideAppInitializer } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { initializeFirebase } from './firebase.init';
import { LucideAngularModule, MessageSquare, Mic, Music, Settings, ChevronLeft, ChevronRight, ChevronDown, Plus, BookOpen, Users, LogOut, Menu, X } from 'lucide-angular';
import * as Sentry from '@sentry/angular';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideAnimations(),
    provideRouter(routes),
    provideHttpClient(withFetch()),
    importProvidersFrom(LucideAngularModule.pick({ MessageSquare, Mic, Music, Settings, ChevronLeft, ChevronRight, ChevronDown, Plus, BookOpen, Users, LogOut, Menu, X })),
    {
      provide: APP_INITIALIZER,
      useFactory: () => () => initializeFirebase(),
      multi: true
    },
    provideAppInitializer(async () => {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
      }
    }),
    {
      provide: ErrorHandler,
      useValue: Sentry.createErrorHandler(),
    },
    {
      provide: Sentry.TraceService,
      deps: [Router],
    },
    provideAppInitializer(() => {
      inject(Sentry.TraceService);
    }),
  ]
};
