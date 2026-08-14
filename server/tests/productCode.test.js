/**
 * The product code IS the cost bucket (docs/07 R6). The parser must keep a
 * decimal point — point-value codes like 'K24.50' are real and must price as
 * 24.5 × multiplier, NOT 2450 × multiplier. This is a pure-unit test (no DB).
 */
import { describe, it, expect } from 'vitest';
import { parseCodeNumber } from '../src/utils/productCode.js';
import { costRateForProduct } from '../src/services/profit.js';

describe('parseCodeNumber', () => {
  it('parses whole-number codes (letter prefix is decorative)', () => {
    expect(parseCodeNumber('K30')).toBe(30);
    expect(parseCodeNumber('k44')).toBe(44);
    expect(parseCodeNumber('M180')).toBe(180);
  });

  it('KEEPS the decimal point for point-value codes', () => {
    expect(parseCodeNumber('K24.50')).toBe(24.5);
    expect(parseCodeNumber('k7.5')).toBe(7.5);
    expect(parseCodeNumber('12.25')).toBe(12.25);
  });

  it('is 0 for empty / letter-only / nullish input', () => {
    expect(parseCodeNumber('')).toBe(0);
    expect(parseCodeNumber('ABC')).toBe(0);
    expect(parseCodeNumber(null)).toBe(0);
    expect(parseCodeNumber(undefined)).toBe(0);
  });
});

describe('costRateForProduct with a point-value code', () => {
  it('K24.50 × 50 = 1225 (not 122,500)', () => {
    const setting = { codeMultiplier: 50 };
    // From the code string (no stored codeNumber):
    expect(costRateForProduct({ code: 'K24.50' }, setting)).toBe(1225);
    // From the denormalised codeNumber (what the model stores after the fix):
    expect(costRateForProduct({ codeNumber: 24.5 }, setting)).toBe(1225);
  });
});
