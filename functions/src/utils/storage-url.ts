import { randomUUID } from 'crypto';

/** New Firebase Storage download token (stored as `metadata.firebaseStorageDownloadTokens`). */
export function newDownloadToken(): string {
  return randomUUID();
}

/**
 * Firebase Storage download URL for `path`. With a token the URL works without
 * authentication (like getDownloadURL()); without one, Storage rules apply.
 */
export function buildDownloadUrl(bucketName: string, path: string, token?: string): string {
  const base = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media`;
  return token ? `${base}&token=${token}` : base;
}
