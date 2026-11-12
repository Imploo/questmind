/**
 * Copy text to the clipboard. Resolves to false when the browser refuses (no
 * permission, insecure context), so the caller can offer another way to copy it.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
