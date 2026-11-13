/**
 * Deploy to Firebase in two steps:
 *
 *   1. Functions, with --force. In a pipeline there is no one to answer prompts, and
 *      without --force a deploy stops as soon as a function was removed from the code.
 *      With it, functions that are no longer in functions/src are deleted.
 *   2. Everything else (hosting, Firestore rules and indexes, Storage rules), without
 *      --force. There --force would also delete Firestore indexes that are not listed in
 *      firestore.indexes.json, e.g. ones created from the console.
 *
 * Functions go first: if that step fails, the new app is not put live against old functions.
 *
 * Usage: node scripts/deploy-firebase.js <firebase-project>
 */
const { execSync } = require('child_process');

const project = process.argv[2];
if (!project || !/^[a-z0-9-]+$/.test(project)) {
  console.error('Usage: node scripts/deploy-firebase.js <firebase-project>');
  process.exit(1);
}

function deploy(targets) {
  const command = `npx firebase-tools deploy ${targets} --project ${project}`;
  console.log(`\n> ${command}`);
  execSync(command, { stdio: 'inherit' });
}

try {
  deploy('--only functions --force');
  deploy('--except functions');
} catch {
  // firebase-tools has already printed what went wrong.
  process.exit(1);
}
