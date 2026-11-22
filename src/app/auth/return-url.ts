/**
 * Where to go after signing in: the `returnUrl` a page passed along, when it is an
 * address inside the app; the start page otherwise. A full URL or `//host` is
 * refused, so a crafted sign-in link cannot send someone to another site.
 */
export function safeReturnUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return '/';
  }
  // A return to the sign-in page itself would leave the user there.
  return value.startsWith('/sign-in') ? '/' : value;
}
