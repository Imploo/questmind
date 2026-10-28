import { DocumentReference, Firestore } from 'firebase-admin/firestore';

/** Path of an audio session document. */
export function sessionDocPath(campaignId: string, sessionId: string): string {
  return `campaigns/${campaignId}/audioSessions/${sessionId}`;
}

/** Reference to an audio session document. */
export function sessionRef(db: Firestore, campaignId: string, sessionId: string): DocumentReference {
  return db.doc(sessionDocPath(campaignId, sessionId));
}
