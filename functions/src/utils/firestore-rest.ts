/**
 * Read documents of another Firebase project over the public Firestore REST API.
 * Requests carry no credentials, so the security rules of that project decide:
 * only publicly readable documents come back.
 */

const REQUEST_TIMEOUT_MS = 15_000;

/** A value as the Firestore REST API writes it. */
export interface RestValue {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  stringValue?: string;
  timestampValue?: string;
  mapValue?: { fields?: Record<string, RestValue> };
  arrayValue?: { values?: RestValue[] };
}

interface RestDocument {
  name: string;
  fields?: Record<string, RestValue>;
}

export interface PublicDocument {
  id: string;
  data: Record<string, unknown>;
}

/** Plain JSON for a REST value. Timestamps stay ISO strings; other exotic types become null. */
export function decodeRestValue(value: RestValue): unknown {
  if (value.mapValue) return decodeRestFields(value.mapValue.fields);
  if (value.arrayValue) return (value.arrayValue.values ?? []).map(decodeRestValue);
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.timestampValue !== undefined) return value.timestampValue;
  return null;
}

export function decodeRestFields(fields: Record<string, RestValue> | undefined): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields ?? {}).map(([key, value]) => [key, decodeRestValue(value)]));
}

function documentsUrl(projectId: string, path: string): string {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${encodedPath}`;
}

function toPublicDocument(document: RestDocument): PublicDocument {
  return { id: document.name.split('/').pop() ?? '', data: decodeRestFields(document.fields) };
}

/** One document, or null when it does not exist. */
export async function fetchPublicDocument(projectId: string, path: string): Promise<PublicDocument | null> {
  const response = await fetch(documentsUrl(projectId, path), { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore read of ${path} failed: HTTP ${response.status}`);
  return toPublicDocument((await response.json()) as RestDocument);
}

/** The first documents of a collection, in the given order ("createdAt desc"). */
export async function listPublicDocuments(
  projectId: string,
  collectionPath: string,
  options: { orderBy: string; pageSize: number }
): Promise<PublicDocument[]> {
  const query = new URLSearchParams({ orderBy: options.orderBy, pageSize: String(options.pageSize) });
  const response = await fetch(`${documentsUrl(projectId, collectionPath)}?${query}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Firestore list of ${collectionPath} failed: HTTP ${response.status}`);
  const body = (await response.json()) as { documents?: RestDocument[] };
  return (body.documents ?? []).map(toPublicDocument);
}
