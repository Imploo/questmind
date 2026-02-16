export const environment = {
  production: true,
  useEmulators: false,
  uploadAudioUrl: '/api/uploadAudioToGemini',
  sentry: {
    dsn: 'https://1781192df2b465d67143294e13c12b8f@o4510852114022400.ingest.de.sentry.io/4510852117102672', // Set your Sentry DSN here for production
    environment: 'production'
  },
  firebaseConfig: {
    apiKey: "private",
    authDomain: "questmind-dnd.firebaseapp.com",
    projectId: "questmind-dnd",
    storageBucket: "questmind-dnd.firebasestorage.app",
    messagingSenderId: "894645983773",
    appId: "1:894645983773:web:baed625b9d5ad4cb5bc4f4"
  }
};
