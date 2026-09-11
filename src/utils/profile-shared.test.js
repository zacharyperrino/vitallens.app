import { describe, it, expect } from 'vitest';
import {
  inchesToCm,
  cmToInches,
  lbsToKg,
  kgToLbs,
  CONDITIONS,
  GOAL_OPTIONS,
} from './profile-shared.js';

describe('unit conversions', () => {
  it('uses the exact international inch (2.54 cm)', () => {
    expect(inchesToCm(1)).toBe(2.54);
    expect(inchesToCm(70)).toBeCloseTo(177.8, 6);
    expect(cmToInches(2.54)).toBeCloseTo(1, 10);
  });

  it('uses the international avoirdupois pound (0.45359237 kg)', () => {
    expect(kgToLbs(1)).toBeCloseTo(2.2046226218, 10);
    expect(lbsToKg(1)).toBeCloseTo(0.45359237, 8);
    expect(lbsToKg(150)).toBeCloseTo(68.04, 2);
  });

  it('round-trips lengths in both directions', () => {
    for (const v of [0, 1, 59.5, 70, 84, 250]) {
      expect(cmToInches(inchesToCm(v))).toBeCloseTo(v, 10);
      expect(inchesToCm(cmToInches(v))).toBeCloseTo(v, 10);
    }
  });

  it('round-trips masses in both directions', () => {
    for (const v of [0, 1, 45.5, 68, 150, 300]) {
      expect(kgToLbs(lbsToKg(v))).toBeCloseTo(v, 10);
      expect(lbsToKg(kgToLbs(v))).toBeCloseTo(v, 10);
    }
  });

  it('preserves zero and sign', () => {
    expect(inchesToCm(0)).toBe(0);
    expect(lbsToKg(0)).toBe(0);
    expect(inchesToCm(-1)).toBeLessThan(0);
  });
});

describe('shared option lists', () => {
  it('are non-empty lists of unique strings', () => {
    for (const list of [CONDITIONS, GOAL_OPTIONS]) {
      expect(list.length).toBeGreaterThan(0);
      expect(new Set(list).size).toBe(list.length);
      for (const item of list) expect(typeof item).toBe('string');
    }
  });
});
