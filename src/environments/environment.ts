export const environment = {
  production: true,
  // Get your free Google AI API key from: https://aistudio.google.com/app/apikey
  // Then replace the value below with your actual API key
  googleAiApiKey: 'placeholder',
  // AI model to use for chat (text-only tasks)
  // Options: 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemma-3-27b-it', etc.
  aiModel: 'gemma-3-27b-it',
  // AI model to use for audio transcription (must support audio input)
  // Note: Gemma models don't support audio, use Gemini models for audio
  // Options: 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.0-flash', etc.
  audioModel: 'gemini-2.5-flash',
  kanka: {
    enabled: true,
    apiUrl: 'https://api.kanka.io/1.0',
    token: 'YOUR_KANKA_PERSONAL_ACCESS_TOKEN',
    campaignId: 'YOUR_CAMPAIGN_ID',
    maxContextEntities: 20,
    cacheTimeout: 300000
  },
  firebaseConfig: {
    apiKey: "AIzaSyCMNRdjyllSufbPLfxdVsVwrkL9HL0iO-I",
    authDomain: "questmind-dnd.firebaseapp.com",
    projectId: "questmind-dnd",
    storageBucket: "questmind-dnd.firebasestorage.app",
    messagingSenderId: "894645983773",
    appId: "1:894645983773:web:baed625b9d5ad4cb5bc4f4"
  }
};
