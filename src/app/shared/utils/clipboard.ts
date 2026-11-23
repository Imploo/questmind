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

/**
 * Copy text that is still being fetched (a share link the backend makes). Safari
 * only allows clipboard writes inside the click, so the pending text is handed
 * over as a ClipboardItem promise. Rejects when the browser refuses or the text fails.
 */
export async function copyPendingText(text: Promise<string>): Promise<void> {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    const blob = text.then(value => new Blob([value], { type: 'text/plain' }));
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
    return;
  }
  await navigator.clipboard.writeText(await text);
}
