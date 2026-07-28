import Product from '../models/Product.js';
import { getSetting } from './setting.service.js';
import { parseCodeNumber } from '../utils/productCode.js';

const DEFAULT_MULTIPLIER = 50;

// ⭐ THE PRODUCT CODE IS THE COST (docs/07 R6):
//   costRate = codeNumber × Setting.codeMultiplier
// Never stored on the product — ALWAYS derived here. Accepts a product doc (or
// lean object) plus the Setting for the multiplier; falls back to parsing the
// code and the default multiplier so it also works on raw fixtures.
export function costRateForProduct(product, setting) {
  const n = product?.codeNumber ?? parseCodeNumber(product?.code);
  const multiplier = setting?.codeMultiplier ?? DEFAULT_MULTIPLIER;
  return (n || 0) * multiplier;
}

// The ONLY place a purchase-profit formula may live (docs/07 R8). Default is
// COST_MINUS_RATE (owner-confirmed): buying below the code's cost books the
// difference as purchase profit, without moving the cost (R6.1).
export function calcPurchaseProfit(line, product, setting) {
  if (setting?.purchaseProfitFormula === 'ZERO') return 0;
  return (costRateForProduct(product, setting) - line.rate) * line.qty;
}

// costRate is derived from the code (R6) and never drifts (R6.1). The `date`
// argument exists for a future history lookup; today the cost is a constant of
// the code.
export async function getCostRate(productId, _date) {
  const [product, setting] = await Promise.all([Product.findById(productId).lean(), getSetting()]);
  if (!product) return 0;
  return costRateForProduct(product, setting);
}
