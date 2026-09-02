import mongoose from 'mongoose';
import ApiError from '../utils/ApiError.js';
import { karachiDay } from '../utils/shopDate.js';

const isId = (v) => mongoose.isValidObjectId(v);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// :date param must be a real YYYY-MM-DD.
export function assertValidDate(ymd) {
  if (!DATE_RE.test(ymd) || Number.isNaN(new Date(`${ymd}T00:00:00+05:00`).getTime())) {
    throw ApiError.badRequest(`date must be a valid YYYY-MM-DD (got "${ymd}")`);
  }
}

// A day cannot be posted in the future (shop-local).
export function assertNotFuture(ymd) {
  if (ymd > karachiDay(new Date())) {
    throw ApiError.badRequest(`Cannot post a future date (${ymd})`);
  }
}

/**
 * Validate the five sections of a day (docs/07 R12). Collects every problem and
 * throws one 400 with a list. qty may be NEGATIVE (a return) — only qty === 0 is
 * rejected. Negative stock is never checked here.
 */
export function validateSections(payload = {}) {
  const errors = [];
  const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

  (payload.sales || []).forEach((l, i) => {
    if (!isId(l.productId)) errors.push(`sales[${i}].productId is required`);
    if (num(l.qty) === 0 || Number.isNaN(num(l.qty)))
      errors.push(`sales[${i}].qty must be non-zero (negatives are allowed for returns)`);
    if (Number.isNaN(num(l.rate)) || num(l.rate) < 0) errors.push(`sales[${i}].rate must be >= 0`);
    // Per-line discount is optional; when present it must be a non-negative number.
    if (l.discount !== undefined && l.discount !== '' && !(num(l.discount) >= 0))
      errors.push(`sales[${i}].discount must be >= 0`);
  });

  (payload.purchases || []).forEach((l, i) => {
    if (!isId(l.productId)) errors.push(`purchases[${i}].productId is required`);
    // Party is OPTIONAL on a purchase: no party = CASH purchase (docs/07 R1
    // posting table — cash OUT, stock IN), exactly like a party-less cash sale.
    if (num(l.qty) === 0 || Number.isNaN(num(l.qty)))
      errors.push(`purchases[${i}].qty must be non-zero`);
    if (Number.isNaN(num(l.rate)) || num(l.rate) < 0)
      errors.push(`purchases[${i}].rate must be >= 0`);
  });

  for (const section of ['receipts', 'payments']) {
    (payload[section] || []).forEach((l, i) => {
      if (!isId(l.partyId)) errors.push(`${section}[${i}].partyId is required`);
      if (!(num(l.amount) > 0)) errors.push(`${section}[${i}].amount must be > 0`);
    });
  }

  (payload.expenses || []).forEach((l, i) => {
    if (!isId(l.expenseHeadId)) errors.push(`expenses[${i}].expenseHeadId is required`);
    if (!(num(l.amount) > 0)) errors.push(`expenses[${i}].amount must be > 0`);
  });

  if (payload.discountOnSale !== undefined && num(payload.discountOnSale) < 0) {
    errors.push('discountOnSale must be >= 0');
  }

  if (errors.length) throw ApiError.badRequest('Validation failed', errors);
}
