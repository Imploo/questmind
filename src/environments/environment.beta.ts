export const environment = {
  production: false,
  useEmulators: false,
  uploadAudioUrl: '/api/uploadAudioToGemini',
  sentry: {
    dsn: '', // Empty in development - errors not sent to Sentry
    environment: 'development',
  },
  firebaseConfig: {
    apiKey: "private",
    authDomain: "questmind-beta.firebaseapp.com",
    projectId: "questmind-beta",
    storageBucket: "questmind-beta.firebasestorage.app",
    messagingSenderId: "111769662924",
    appId: "1:111769662924:web:3a7c54c80199921ecd9969"
  }
};
