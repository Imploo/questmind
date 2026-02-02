# Authentication Guard Implementation

## Overview

This document describes the implementation of authentication guards that protect all routes in the Questmind application, requiring users to login before accessing any part of the app.

## Implementation Summary

### 1. Auth Guard (`src/app/auth/auth.guard.ts`)

Created two functional guards using Angular's `CanActivateFn`:

- **`authGuard`**: Protects routes from unauthenticated access

  - Waits for Firebase auth to initialize (checks `isLoading`)
  - Redirects to `/sign-in` if user is not authenticated
  - Preserves the intended URL in `returnUrl` query parameter for post-login redirect

- **`noAuthGuard`**: Prevents authenticated users from accessing public routes
  - Redirects authenticated users away from sign-in page
  - Redirects to the `returnUrl` if available, otherwise to home (`/`)

### 2. Sign-In Page Component (`src/app/auth/sign-in-page.component.ts`)

Created a standalone sign-in page with:

- Google sign-in button with official branding
- Loading state during authentication
- Error message display
- Beautiful UI matching the app's design system
- Automatic redirect after successful login

### 3. App Shell Component (`src/app/app-shell.component.ts`)

Extracted the main application UI into a separate component:

- Contains sidebar navigation
- Handles view switching between Chat and Audio features
- Protected by auth guard (only accessible to authenticated users)

### 4. Route Configuration (`src/app/app.routes.ts`)

Updated routes to enforce authentication:

```typescript
export const routes: Routes = [
  {
    path: 'sign-in',
    component: SignInPageComponent,
    canActivate: [noAuthGuard], // Prevent authenticated users from seeing sign-in
  },
  {
    path: '',
    component: AppShellComponent,
    canActivate: [authGuard], // Require authentication for main app
  },
  {
    path: '**',
    redirectTo: '', // All unknown routes redirect to home (which requires auth)
  },
];
```

### 5. Loading Component (`src/app/loading.component.ts`)

Created a loading screen shown during Firebase auth initialization:

- Displays while `AuthService.isLoading` is true
- Shows a spinner and "Loading Questmind..." message
- Matches app's gradient design

### 6. Main App Component Updates

Updated `App` component to:

- Show loading screen during auth initialization
- Only render router outlet after auth state is determined
- Prevents flash of wrong content

## User Flow

### First-Time/Logged-Out User

1. User visits any route (e.g., `/`)
2. Loading screen shows while Firebase initializes
3. Auth guard detects no authentication
4. User is redirected to `/sign-in?returnUrl=/`
5. User clicks "Sign in with Google"
6. After successful authentication, redirected back to intended route

### Authenticated User

1. User visits any route
2. Loading screen shows briefly while Firebase initializes
3. Auth guard detects authentication
4. User sees the requested content

### Authenticated User Accessing Sign-In

1. User visits `/sign-in`
2. `noAuthGuard` detects authentication
3. User is redirected to home (`/`) or their intended destination

## Security Benefits

1. **Complete Route Protection**: All application routes require authentication
2. **No Content Leakage**: Users can't access any protected content without signing in
3. **Proper Loading State**: No flash of unauthorized content during auth initialization
4. **Return URL Preservation**: Users are redirected to their intended destination after login
5. **Firebase Integration**: Leverages Firebase's secure authentication system

## Technical Details

### Auth State Management

- Uses Angular signals for reactive state management
- `AuthService.isLoading` signal tracks initialization state
- `AuthService.isAuthenticated` computed signal for auth status
- Guards use `toObservable()` to convert signals to observables for route guards

### Guard Behavior

- Guards wait for auth to finish loading using `filter(loading => !loading)`
- Use `take(1)` to complete the observable after first emission
- Return `UrlTree` for redirects instead of manually navigating

## Files Modified/Created

### Created Files

- `src/app/auth/auth.guard.ts` - Auth guard functions
- `src/app/auth/sign-in-page.component.ts` - Sign-in page UI
- `src/app/app-shell.component.ts` - Main app shell (extracted from App)
- `src/app/loading.component.ts` - Loading screen component

### Modified Files

- `src/app/app.routes.ts` - Added route guards
- `src/app/app.ts` - Simplified to just handle loading/routing
- `src/app/app.html` - Updated to show loading state and router outlet

## Testing Recommendations

1. **Sign In Flow**: Verify users can sign in with Google
2. **Route Protection**: Try accessing routes while logged out
3. **Return URL**: Log out, try to access a specific route, verify redirect after login
4. **Authenticated Redirect**: While logged in, try to access `/sign-in`
5. **Loading State**: Verify no flash of wrong content during load
6. **Sign Out**: Verify users are redirected to sign-in after signing out

## Future Enhancements

Potential improvements:

1. Add email/password sign-in option
2. Remember me functionality
3. Password reset flow
4. Email verification
5. Profile completion step for new users
6. Role-based access control for specific routes
