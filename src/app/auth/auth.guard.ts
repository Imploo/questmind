import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';
import { map, filter, take } from 'rxjs/operators';
import { toObservable } from '@angular/core/rxjs-interop';

/**
 * Auth guard that protects routes from unauthenticated access.
 * Redirects to sign-in page if user is not authenticated.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Wait for auth to finish loading, then check authentication status
  return toObservable(authService.isLoading).pipe(
    // Wait until loading is complete
    filter(loading => !loading),
    // Take only the first non-loading state
    take(1),
    // Check authentication status
    map(() => {
      const isAuthenticated = authService.isAuthenticated();
      
      if (isAuthenticated) {
        return true;
      }
      
      // Redirect to sign-in with return URL
      return router.createUrlTree(['/sign-in'], {
        queryParams: { returnUrl: state.url }
      });
    })
  );
};

/**
 * Prevents authenticated users from accessing public routes like sign-in.
 * Redirects to home/dashboard if user is already authenticated.
 */
export const noAuthGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return toObservable(authService.isLoading).pipe(
    filter(loading => !loading),
    take(1),
    map(() => {
      const isAuthenticated = authService.isAuthenticated();
      
      if (!isAuthenticated) {
        return true;
      }
      
      // Check for return URL or redirect to home
      const returnUrl = route.queryParams['returnUrl'] || '/';
      return router.createUrlTree([returnUrl]);
    })
  );
};
