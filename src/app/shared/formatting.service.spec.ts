import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { I18nService } from '../core/i18n/i18n.service';
import { provideTestLanguage } from '../core/i18n/testing';
import { formatDay, formatFileSize, formatList, formatNumber, FormattingService } from './formatting.service';

describe('formatDay', () => {
  it('writes a stored session day the way people do, in the given locale', () => {
    expect(formatDay('2026-11-06', 'nl-NL')).toBe('6 nov 2026');
    expect(formatDay('2026-11-06', 'en-GB')).toBe('6 Nov 2026');
  });

  it('leaves anything that is not a stored day as it is', () => {
    expect(formatDay('Unknown', 'nl-NL')).toBe('Unknown');
    expect(formatDay('', 'nl-NL')).toBe('');
    expect(formatDay(undefined, 'nl-NL')).toBe('');
  });
});

describe('formatList', () => {
  it('joins names the way the locale does', () => {
    expect(formatList(['Mira'], 'nl-NL')).toBe('Mira');
    expect(formatList(['Mira', 'Kael'], 'nl-NL')).toBe('Mira en Kael');
    expect(formatList(['Mira', 'Kael', 'Thalia'], 'nl-NL')).toBe('Mira, Kael en Thalia');
    expect(formatList(['Mira', 'Kael'], 'en-GB')).toBe('Mira and Kael');
    expect(formatList([], 'en-GB')).toBe('');
  });
});

describe('formatNumber', () => {
  it('groups thousands the way the locale does', () => {
    expect(formatNumber(12500, 'nl-NL')).toBe('12.500');
    expect(formatNumber(12500, 'en-GB')).toBe('12,500');
    expect(formatNumber(1.5, 'nl-NL')).toBe('1,5');
  });
});

describe('formatFileSize', () => {
  it('gives the text for an unknown size when there is none', () => {
    expect(formatFileSize(undefined)).toBe('');
    expect(formatFileSize(0, 'N/A')).toBe('N/A');
    expect(formatFileSize(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});

describe('FormattingService', () => {
  it('follows the active language', () => {
    TestBed.configureTestingModule({ providers: [provideTestLanguage('nl')] });
    const formatting = TestBed.inject(FormattingService);
    const i18n = TestBed.inject(I18nService);

    expect(formatting.formatDay('2026-11-06')).toBe('6 nov 2026');
    expect(formatting.formatFileSize(undefined)).toBe('n.v.t.');

    i18n.use('en');

    expect(formatting.formatDay('2026-11-06')).toBe('6 Nov 2026');
    expect(formatting.formatFileSize(undefined)).toBe('N/A');
  });
});
