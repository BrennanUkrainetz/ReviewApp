import { describe, expect, it } from 'vitest';
import { formatBig, formatDelta, formatMultiplier } from './bignum';

describe('formatBig', () => {
  it('writes small numbers out in full', () => {
    expect(formatBig(0)).toBe('0');
    expect(formatBig(940)).toBe('940');
    expect(formatBig(999)).toBe('999');
  });

  it('holds three significant digits across every tier', () => {
    expect(formatBig(1_000)).toBe('1.00K');
    expect(formatBig(12_400)).toBe('12.4K');
    expect(formatBig(124_000)).toBe('124K');
    expect(formatBig(1_240_000)).toBe('1.24M');
    expect(formatBig(38_000_000_000_000)).toBe('38.0T');
  });

  it('rolls up to the next tier rather than printing 1000K', () => {
    expect(formatBig(999_999)).toBe('1.00M');
    expect(formatBig(999_999_999)).toBe('1.00B');
  });

  it('keeps a suffix deep into the range the high islands reach', () => {
    expect(formatBig(2.4e21)).toBe('2.40Sx');
    expect(formatBig(1e36)).toBe('1.00Ud');
    expect(formatBig(1e63)).toBe('1.00Vg');
  });

  it('falls back to scientific notation past the named scale', () => {
    expect(formatBig(1e66)).toBe('1.00e+66');
    expect(formatBig(1.23e69)).toBe('1.23e+69');
  });

  it('handles negatives and non-numbers without producing nonsense', () => {
    expect(formatBig(-12_400)).toBe('-12.4K');
    expect(formatBig(Number.NaN)).toBe('—');
    expect(formatBig(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('formatMultiplier', () => {
  it('drops trailing zeroes so a doubling reads as ×2', () => {
    expect(formatMultiplier(2)).toBe('×2');
    expect(formatMultiplier(1.5)).toBe('×1.5');
    expect(formatMultiplier(1.234)).toBe('×1.23');
  });

  it('falls back to short scale once it outgrows a plain number', () => {
    expect(formatMultiplier(12_400)).toBe('×12.4K');
  });
});

describe('formatDelta', () => {
  it('always carries a sign', () => {
    expect(formatDelta(1_240)).toBe('+1.24K');
    expect(formatDelta(-40)).toBe('-40');
  });
});
