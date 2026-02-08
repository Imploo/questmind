import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection, APP_INITIALIZER, importProvidersFrom, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';
import { initializeFirebase } from './firebase.init';
import { LucideAngularModule, MessageSquare, Mic, Music, Settings, ChevronLeft, ChevronRight, Plus, BookOpen } from 'lucide-angular';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(withFetch()),
    importProvidersFrom(LucideAngularModule.pick({ MessageSquare, Mic, Music, Settings, ChevronLeft, ChevronRight, Plus, BookOpen })),
    {
      provide: APP_INITIALIZER,
      useFactory: () => () => initializeFirebase(),
      multi: true
    },
    provideServiceWorker('custom-sw.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
};
