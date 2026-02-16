export const environment = {
  production: true,
  useEmulators: false,
  uploadAudioUrl: '/api/uploadAudioToGemini',
  eleven: {
    voice1: 'Bill Oxley',
    voice2: 'Ruth',
    apiKey: 'private'
  },
  // Google Cloud API key for Text-to-Speech
  // Get from: https://console.cloud.google.com/apis/credentials
  // Enable Cloud Text-to-Speech API first
  googleCloudApiKey: 'YOUR_GOOGLE_CLOUD_API_KEY',
  // AI model to use for chat (text-only tasks)
  // Options: 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemma-3-27b-it', etc.
  aiModel: 'gemma-3-27b-it',
  // AI model to use for audio transcription (must support audio input)
  // Note: Gemma models don't support audio, use Gemini models for audio
  // Options: 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.0-flash', etc.
  audioModel: 'gemini-2.5-flash',
  // Text-to-Speech configuration
  tts: {
    enabled: true,
    // Dutch WaveNet voices (most natural)
    // Options: nl-NL-Wavenet-A (female), nl-NL-Wavenet-B (male), 
    //          nl-NL-Wavenet-C (male), nl-NL-Wavenet-D (female), nl-NL-Wavenet-E (female)
    voiceMale: 'nl-NL-Wavenet-B',
    voiceFemale: 'nl-NL-Wavenet-A',
    speakingRate: 1.0,
    pitch: 0.0
  },
  kanka: {
    enabled: true,
    apiUrl: 'https://api.kanka.io/1.0',
    token: 'YOUR_KANKA_PERSONAL_ACCESS_TOKEN',
    campaignId: 'YOUR_CAMPAIGN_ID',
    maxContextEntities: 20,
    cacheTimeout: 300000
  },
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
