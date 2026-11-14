import { formatDay } from './formatting.service';

describe('formatDay', () => {
  it('writes a stored session day the way people do', () => {
    expect(formatDay('2026-11-06')).toBe('6 nov 2026');
  });

  it('leaves anything that is not a stored day as it is', () => {
    expect(formatDay('Unknown')).toBe('Unknown');
    expect(formatDay('')).toBe('');
    expect(formatDay(undefined)).toBe('');
  });
});
