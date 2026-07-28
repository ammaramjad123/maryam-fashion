import mongoose from 'mongoose';
import Product from '../models/Product.js';
import StockTransaction from '../models/StockTransaction.js';
import { nextDayStart } from '../utils/shopDate.js';

const { Types } = mongoose;

/**
 * Closing stock quantity as of the WHOLE shop-local day `uptoDate`.
 *
 *   closing = openingStock + ΣpurchaseQty − ΣsaleQty   (sale qty is SIGNED,
 *   so a return — negative qty — INCREASES stock). Negative stock is allowed.
 */
export async function getStock(productId, uptoDate) {
  const upper = nextDayStart(uptoDate);
  const product = await Product.findById(productId).lean();
  let stock = product?.openingStock || 0;

  const txns = await StockTransaction.find({
    productId: new Types.ObjectId(String(productId)),
    date: { $lt: upper },
  }).lean();

  for (const t of txns) {
    if (t.type === 'SALE')
      stock -= t.qty; // outward; a return (t.qty < 0) adds back
    else stock += t.qty; // PURCHASE / ADJUSTMENT / OPENING
  }
  return stock;
}
