#!/usr/bin/env node

/**
 * Generates a test Firebase Auth token for local emulator testing
 * Usage: node generate-test-token.js [userId]
 */

const userId = process.argv[2] || 'test-user-123';

// For Firebase Emulator, we can create a simple JWT-like structure
// The emulator accepts a simple structure for testing
const testToken = JSON.stringify({
  user_id: userId,
  email: 'test@example.com',
  email_verified: true
});

const base64Token = Buffer.from(testToken).toString('base64');

console.log('\n=== Firebase Emulator Test Auth Token ===\n');
console.log('User ID:', userId);
console.log('\nAdd this to your Bruno request headers:');
console.log('Authorization: Bearer', base64Token);
console.log('\nOr use this in the "Auth" tab:');
console.log('Type: Bearer Token');
console.log('Token:', base64Token);
console.log('\n=========================================\n');
