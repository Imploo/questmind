/** Message shown when a Cloud Function refuses a call because the user lacks rights. */
export const PERMISSION_DENIED_MESSAGE =
  'Je hebt geen rechten voor deze actie. Alleen leden of de eigenaar van de campagne (of het personage) mogen dit.';

/** Error code of a failed callable (`functions/permission-denied` → `permission-denied`), or null. */
export function callableErrorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code !== 'string' || !code) return null;
  return code.startsWith('functions/') ? code.slice('functions/'.length) : code;
}

export function isPermissionDenied(error: unknown): boolean {
  return callableErrorCode(error) === 'permission-denied';
}
