/**
 * The address to share a character with. The character page is public, so anyone with
 * the link can view it; this address also gives chat apps a preview with the
 * character's name and portrait (see the characterSharePage function).
 */
export function characterShareUrl(characterId: string): string {
  return `${window.location.origin}/share/character/${characterId}`;
}
