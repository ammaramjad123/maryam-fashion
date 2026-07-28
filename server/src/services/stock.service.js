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

/**
 * Closing stock for EVERY product as of `uptoDate`, in ONE aggregation over
 * StockTransaction (grouped by productId) merged with the products' openingStock
 * — the batch form of getStock, to avoid an N+1 (two round-trips per product)
 * when a caller needs the whole inventory (dashboard, Daily Stock report).
 * Mirrors getStock exactly: SALE subtracts (a negative-qty return adds back),
 * everything else adds. Returns a Map: productId(string) → closing qty.
 */
export async function getStockAll(uptoDate) {
  const upper = nextDayStart(uptoDate);
  const [products, txns] = await Promise.all([
    Product.find().select('_id openingStock').lean(),
    StockTransaction.aggregate([
      { $match: { date: { $lt: upper } } },
      {
        $group: {
          _id: '$productId',
          net: {
            $sum: { $cond: [{ $eq: ['$type', 'SALE'] }, { $multiply: ['$qty', -1] }, '$qty'] },
          },
        },
      },
    ]),
  ]);
  const net = new Map(txns.map((t) => [String(t._id), t.net]));
  const map = new Map();
  for (const p of products) {
    map.set(String(p._id), (p.openingStock || 0) + (net.get(String(p._id)) || 0));
  }
  return map;
}
