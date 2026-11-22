import { describe, it, expect } from 'vitest';
import { safeReturnUrl } from './return-url';

describe('safeReturnUrl', () => {
  it('keeps an address inside the app, with its query', () => {
    expect(safeReturnUrl('/share/campaign/abc/sessions/s1')).toBe('/share/campaign/abc/sessions/s1');
    expect(safeReturnUrl('/characters/c1?tab=play')).toBe('/characters/c1?tab=play');
  });

  it('refuses anything that leaves the app, and goes to the start page instead', () => {
    for (const value of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '', undefined, 42]) {
      expect(safeReturnUrl(value)).toBe('/');
    }
  });

  it('does not return to the sign-in page', () => {
    expect(safeReturnUrl('/sign-in?returnUrl=%2F')).toBe('/');
  });
});
