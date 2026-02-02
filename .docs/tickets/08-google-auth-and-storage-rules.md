# Google Login + Secure Storage Rules

## Overview

Add Google account sign-in so users can authenticate and access their own audio sessions. Update Firebase Storage and Firestore rules to enforce authenticated access and user scoping.

**Status:** ⚠️ **CRITICAL** - Current rules allow public read/write access  
**Priority:** P0 - Security vulnerability  
**Effort:** ~4-6 hours

## Current State

### Security Issues

- `storage.rules`: Public read/write access (`allow read, write: if true`)
- `firestore.rules`: Temporary public access (expires 2026-03-03)
- No authentication implemented
- All users share the same data storage path

### Existing Infrastructure

- ✅ Firebase SDK v12.8.0 installed (includes Auth)
- ✅ Firebase app initialized in `AudioSessionService`
- ✅ Firestore and Storage configured
- ✅ Environment config with Firebase credentials
- ❌ No Auth service or UI components
- ❌ No user-scoped storage paths

## Key Requirements

### 1. Authentication (Google + Email/Password)

**Available Providers:** ✅ Google and Email/Password enabled in Firebase

**User Experience:**

- Sign in/out with Google (popup or redirect flow)
- Sign in/up with email and password
- Display user profile (name, email, avatar) in header
- Persist authentication state across page refresh
- Clear loading states during auth operations
- Handle auth errors gracefully (popup blocked, network errors, invalid credentials)
- Password reset flow for email/password users

**Technical:**

- Use Firebase Auth `GoogleAuthProvider` and `EmailAuthProvider`
- Store auth state in Angular signals for reactivity
- Protect routes/features requiring authentication
- Expose `userId` to services needing user-scoped data

### 2. Storage Security

**Current:** `audio-sessions/{sessionId}/{files}`  
**Target:** `audio-sessions/{userId}/{sessionId}/{files}`

**Rules:**

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // User-scoped audio sessions
    match /audio-sessions/{userId}/{sessionId}/{allPaths=**} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null
                   && request.auth.uid == userId
                   && request.resource.size < 500 * 1024 * 1024  // 500MB limit
                   && request.resource.contentType.matches('audio/.*');
    }

    // Block all other paths
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

### 3. Firestore Security

**Current:** `audioSessions/{sessionId}`  
**Target:** `users/{userId}/audioSessions/{sessionId}`

**Rules:**

```javascript
rules_version='2'

service cloud.firestore {
  match /databases/{database}/documents {
    // User audio sessions
    match /users/{userId}/audioSessions/{sessionId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      // Validate session data structure
      allow create, update: if request.auth != null
                            && request.auth.uid == userId
                            && request.resource.data.keys().hasAll(['createdAt', 'status'])
                            && request.resource.data.status in ['uploading', 'transcribing', 'completed', 'error'];
    }

    // User transcriptions subcollection
    match /users/{userId}/audioSessions/{sessionId}/transcriptions/{transcriptionId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Block all other paths
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

## Technical Implementation

### Phase 1: Auth Service & UI (2-3 hours)

**1.1 Create Auth Service**

File: `src/app/auth/auth.service.ts`

```typescript
@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth: Auth;
  private user = signal<User | null>(null);
  private loading = signal<boolean>(true);
  private error = signal<string | null>(null);

  // Public read-only signals
  readonly currentUser = this.user.asReadonly();
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly isLoading = this.loading.asReadonly();
  readonly authError = this.error.asReadonly();

  constructor() {
    this.auth = getAuth(getApp());
    this.initAuthStateListener();
  }

  private initAuthStateListener(): void {
    /* ... */
  }

  // Google Auth
  signInWithGoogle(): Promise<UserCredential> {
    /* ... */
  }

  // Email/Password Auth
  signInWithEmail(email: string, password: string): Promise<UserCredential> {
    /* ... */
  }
  signUpWithEmail(email: string, password: string): Promise<UserCredential> {
    /* ... */
  }
  sendPasswordReset(email: string): Promise<void> {
    /* ... */
  }

  // Common
  signOut(): Promise<void> {
    /* ... */
  }
}
```

**1.2 Create Auth UI Components**

File: `src/app/auth/auth-button.component.ts`

- Show sign-in button when not authenticated
- Show user avatar + sign-out button when authenticated
- Display loading spinner during auth operations

File: `src/app/auth/sign-in-modal.component.ts`

- Tabbed interface: "Sign In" and "Sign Up" tabs
- Google sign-in button (prominent)
- Email/password form fields
- "Forgot password?" link
- Toggle between sign-in and sign-up modes
- Display auth errors inline
- Loading states for form submission
- Display loading spinner during auth operations

File: `src/app/auth/sign-in-modal.component.ts`

- Tabbed interface: "Sign In" and "Sign Up" tabs
- Google sign-in button (prominent)
- Email/password form fields
- "Forgot password?" link
- Toggle between sign-in and sign-up modes
- Display auth errors inline
- Loading states for form submission

**1.3 Update App Layout**

File: `src/app/app.html`

- Add auth button to header/sidebar
- Show authenticated state throughout the app
- Optional: Add route guards for protected features

### Phase 2: Migrate Storage Paths (1-2 hours)

**2.1 Update AudioSessionService**

Changes needed in `src/app/audio/audio-session.service.ts`:

```typescript
export class AudioSessionService {
  private userId: string | null = null;

  constructor(private authService: AuthService) {
    // Subscribe to auth state
    effect(() => {
      const user = this.authService.currentUser();
      this.userId = user?.uid || null;

      if (this.userId) {
        this.loadUserSessions(this.userId);
      } else {
        this.clearSessions();
      }
    });
  }

  // Update path helpers
  private getSessionStoragePath(sessionId: string): string {
    if (!this.userId) throw new Error('User not authenticated');
    return `audio-sessions/${this.userId}/${sessionId}`;
  }

  private getSessionDocPath(sessionId: string): string {
    if (!this.userId) throw new Error('User not authenticated');
    return `users/${this.userId}/audioSessions/${sessionId}`;
  }

  private getTranscriptionDocPath(sessionId: string, transcriptionId: string): string {
    if (!this.userId) throw new Error('User not authenticated');
    return `users/${this.userId}/audioSessions/${sessionId}/transcriptions/${transcriptionId}`;
  }

  // Update all methods using these paths
  async uploadAudio(upload: AudioUpload): Promise<void> {
    /* ... */
  }
  private loadUserSessions(userId: string): void {
    /* ... */
  }
  // etc.
}
```

**2.2 Update Audio Components**

- `audio-session.component.ts`: Show auth prompt if not signed in
- `audio-upload.component.ts`: Disable upload UI when not authenticated
- Add user-friendly messages: "Sign in to upload audio sessions"

### Phase 3: Deploy Security Rules (30 min)

**3.1 Update Rules Files**

- Update `storage.rules` (see section 2 above)
- Update `firestore.rules` (see section 3 above)

**3.2 Deploy Rules**

```bash
# Test rules locally first
firebase emulators:start --only firestore,storage

# Deploy to production
firebase deploy --only firestore:rules,storage
```

**3.3 Verify Rules**

Test in Firebase Console:

- Rules Playground for Firestore
- Try unauthenticated access (should fail)
- Try cross-user access (should fail)
- Try authenticated own-user access (should succeed)

### Phase 4: Data Migration (if needed) (1 hour)

If existing sessions need migration:

1. Export existing data
2. Create migration script to restructure paths
3. Run migration in Firebase Console or Cloud Function
4. Verify migrated data
5. Clean up old data

## Testing Checklist

### Authentication Flow

- [ ] User can sign in with Google (popup opens correctly)
- [ ] User can sign in with email/password
- [ ] User can sign up with email/password
- [ ] Email validation and password strength requirements work
- [ ] Password reset email sends successfully
- [ ] User profile displays after sign-in (name, email, avatar)
- [ ] User can sign out (clears state completely)
- [ ] Auth state persists across page refresh
- [ ] Auth errors display user-friendly messages (wrong password, email exists, etc.)
- [ ] Loading states show during auth operations

### Storage Security

- [ ] Authenticated user can upload audio files
- [ ] Unauthenticated upload attempts fail with clear error
- [ ] User can access their own uploaded files
- [ ] User cannot access other users' files (test with 2 accounts)
- [ ] Files over 500MB are rejected
- [ ] Non-audio files are rejected

### Firestore Security

- [ ] Authenticated user can create session documents
- [ ] User can read their own sessions
- [ ] User cannot read other users' sessions (test with 2 accounts)
- [ ] Unauthenticated access to Firestore fails
- [ ] Session documents validate required fields
- [ ] Transcription subcollections respect user scoping

### User Experience

- [ ] Sessions list updates in real-time after sign-in
- [ ] Sessions list clears after sign-out
- [ ] Clear messaging when auth is required
- [ ] No console errors during auth flow
- [ ] Graceful degradation when auth fails

## Acceptance Criteria

✅ **Security:**

- Storage and Firestore rules enforce authentication
- Users cannot access other users' data
- Public access is completely blocked
- File size and type restrictions enforced

✅ **Functionality:**

- Google sign-in/out works reliably
- Auth state persists across refresh
- Audio upload/transcription flow works for authenticated users
- Sessions are properly scoped per user

✅ **User Experience:**

- Clear auth UI in header/sidebar
- Loading and error states handled gracefully
- Helpful messages guide users through auth requirements
- No breaking changes to existing features

## Notes

- Firebase Auth is already included in `firebase@12.8.0` dependency
- ✅ Google and Email/Password providers enabled in Firebase Console
- Email verification optional but recommended for production
- Consider email verification requirement before allowing uploads
- Future enhancements:
  - User profile management (display name, avatar upload)
  - Session sharing features between users
  - Rate limiting uploads per user (via Firestore rules or Cloud Functions)
  - OAuth providers (GitHub, Discord for D&D community)
