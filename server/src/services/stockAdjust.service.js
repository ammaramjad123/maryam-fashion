import Product from '../models/Product.js';
import StockTransaction from '../models/StockTransaction.js';
import ApiError from '../utils/ApiError.js';
import { getStock, getStockAll } from './stock.service.js';
import { getSetting } from './setting.service.js';
import { costRateForProduct } from './profit.js';
import { karachiDay } from '../utils/shopDate.js';

// The single Products/Stock listing: per active product, the DERIVED current
// stock (getStock — never the stored openingStock, docs/04) and the DERIVED cost
// (codeNumber × multiplier, docs/07 R6). costRate is profit-sensitive → the
// central profitFilter strips it for users without viewProfit. Sorted by code
// number so k2, k3 … k180 read in order.
export async function getCurrentStock(ymd) {
  const [products, setting, stockMap] = await Promise.all([
    Product.find({ isActive: true }).sort({ codeNumber: 1, code: 1 }).lean(),
    getSetting(),
    getStockAll(ymd), // ALL products' derived stock in ONE aggregation, not per-product
  ]);
  return products.map((p) => ({
    productId: p._id,
    code: p.code,
    name: p.name,
    codeNumber: p.codeNumber,
    costRate: costRateForProduct(p, setting), // derived; stripped for operators
    stock: stockMap.get(String(p._id)) || 0, // derived current stock, NOT openingStock
  }));
}

/**
 * Record a stock adjustment as a StockTransaction (type ADJUSTMENT). Never a
 * silent edit — a reason is mandatory and the movement is a first-class voucher.
 * IN → +qty, OUT → −qty; getStock adds ADJUSTMENT rows straight to the balance.
 */
export async function adjustStock({ productId, qty, direction, reason }, user) {
  const q = Math.abs(Number(qty));
  if (!q || Number.isNaN(q)) throw ApiError.badRequest('qty must be a non-zero number');
  if (!['IN', 'OUT'].includes(direction))
    throw ApiError.badRequest("direction must be 'IN' or 'OUT'");
  if (!reason || !String(reason).trim()) {
    throw ApiError.badRequest('A reason is required for a stock adjustment');
  }

  const product = await Product.findById(productId);
  if (!product) throw ApiError.notFound('Product not found');

  const signed = direction === 'IN' ? q : -q;
  await StockTransaction.create({
    date: new Date(),
    productId: product._id,
    type: 'ADJUSTMENT',
    qty: signed,
    rate: 0,
    sourceType: 'ADJUSTMENT',
    narration: `${direction} ${q} — ${String(reason).trim()}${user?.name ? ` (by ${user.name})` : ''}`,
  });

  return {
    productId: product._id,
    code: product.code,
    stock: await getStock(product._id, karachiDay(new Date())),
  };
}
