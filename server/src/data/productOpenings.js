// Real opening stocks from the 24/07/2025 Daily Stock Report, keyed by code
// number (code = `K${n}`). These are the ONLY 41 codes the shop uses. The
// quantities sum to exactly 2,804 — the sheet's Opening total (asserted in a
// test). Cost is never stored — it derives from the code (docs/07 R6).
export const PRODUCT_OPENINGS = {
  2: 477,
  3: 161,
  4: 40,
  5: 316,
  6: 3,
  7: 82,
  9: 145,
  10: 86,
  11: 3,
  12: 18,
  13: 6,
  14: 8,
  15: 60,
  17: 4,
  19: 3,
  20: 275,
  22: 1,
  23: 5,
  29: 1,
  30: 551,
  32: 44,
  38: 4,
  40: 117,
  44: 296,
  48: 8,
  50: 0,
  54: 8,
  58: 1,
  60: 1,
  64: 36,
  68: 15,
  78: 1,
  80: 13,
  85: 1,
  88: 1,
  90: 1,
  120: 4,
  130: 3,
  134: 1,
  136: 2,
  180: 2,
};

// The 41 code numbers, in ascending order.
export const CODE_NUMBERS = Object.keys(PRODUCT_OPENINGS).map(Number);

// The verified Opening total on the real sheet.
export const OPENING_TOTAL = 2804;
