import { describe, it, expect } from 'vitest';
import { esc } from './esc.js';

describe('esc', () => {
  it('escapes each of the five HTML-significant characters', () => {
    expect(esc('&')).toBe('&amp;');
    expect(esc('<')).toBe('&lt;');
    expect(esc('>')).toBe('&gt;');
    expect(esc('"')).toBe('&quot;');
    expect(esc("'")).toBe('&#39;');
  });

  it('neutralises a script payload so it cannot break out of innerHTML', () => {
    expect(esc('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
    expect(esc(`<img src=x onerror='alert(1)'>`)).toBe(
      '&lt;img src=x onerror=&#39;alert(1)&#39;&gt;',
    );
  });

  it('escapes & first so pre-existing entities are not decoded', () => {
    expect(esc('&lt;')).toBe('&amp;lt;');
    expect(esc('&amp;')).toBe('&amp;amp;');
  });

  it('returns an empty string for null and undefined', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });

  it('stringifies non-string values instead of dropping them', () => {
    expect(esc(42)).toBe('42');
    expect(esc(0)).toBe('0');
    expect(esc(false)).toBe('false');
  });

  it('leaves plain text untouched', () => {
    expect(esc('Grilled chicken, 350 kcal')).toBe('Grilled chicken, 350 kcal');
    expect(esc('')).toBe('');
  });
});
