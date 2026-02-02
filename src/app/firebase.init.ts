import { initializeApp, getApps } from 'firebase/app';
import { environment } from '../environments/environment';

export function initializeFirebase(): void {
  // Only initialize if not already initialized
  if (getApps().length === 0) {
    if (
      !environment.firebaseConfig ||
      !environment.firebaseConfig.apiKey ||
      environment.firebaseConfig.apiKey === 'YOUR_FIREBASE_API_KEY'
    ) {
      console.error('Firebase config is missing. Update environment.firebaseConfig first.');
      return;
    }
    initializeApp(environment.firebaseConfig);
  }
}
