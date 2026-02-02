# Firestore Rules (Temporary)

This is a temporary ruleset to unblock development. It allows all reads
and writes for all documents. Replace with least-privilege rules before
production.

```rules
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```
