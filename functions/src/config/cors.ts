/**
 * Shared CORS configuration for all callable functions.
 * Lives outside `index.ts` so modules can import it without a circular import.
 */
export const SHARED_CORS = [
  'https://questmind.nl',
  'http://localhost:4200',
  /^https:\/\/.*\.web\.app$/,
  /^https:\/\/.*\.firebaseapp\.com$/
];
