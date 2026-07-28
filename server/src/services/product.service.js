import mongoose from 'mongoose';
import Product from '../models/Product.js';
import ApiError from '../utils/ApiError.js';
import { getPagination, paginated, escapeRegex } from '../utils/pagination.js';
import { getSetting } from './setting.service.js';
import { costRateForProduct } from './profit.js';

// Serialise a product for the API, attaching the DERIVED costRate (docs/07 R6).
// costRate is profit-sensitive, so the central profitFilter strips it for users
// without viewProfit — admins see it, operators never do.
function serialize(product, setting) {
  return { ...product.toJSON(), costRate: costRateForProduct(product, setting) };
}

function statusFilter(status) {
  if (status === 'all') return {};
  if (status === 'inactive') return { isActive: false };
  return { isActive: true };
}

export async function list(query) {
  const { page, limit, skip } = getPagination(query);
  const filter = { ...statusFilter(query.status) };

  if (query.category) filter.category = query.category;

  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search.trim()), 'i');
    filter.$or = [{ code: rx }, { name: rx }];
  }

  const [items, total, setting] = await Promise.all([
    Product.find(filter).sort({ codeNumber: 1, code: 1 }).skip(skip).limit(limit),
    Product.countDocuments(filter),
    getSetting(),
  ]);

  return paginated(
    items.map((p) => serialize(p, setting)),
    total,
    page,
    limit
  );
}

// Type-ahead for the Day Book (active products, minimal fields).
export async function search(query) {
  const q = (query.q || '').trim();
  const limit = Math.min(20, Math.max(1, parseInt(query.limit, 10) || 10));
  const filter = { isActive: true };
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ code: rx }, { name: rx }];
  }
  return Product.find(filter).select('code name saleRate').sort({ codeNumber: 1, code: 1 }).limit(limit);
}

// Internal: the Mongoose document, for mutation.
async function findDoc(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Product not found');
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');
  return product;
}

export async function getById(id) {
  const [product, setting] = await Promise.all([findDoc(id), getSetting()]);
  return serialize(product, setting);
}

export async function create(data) {
  const code = (data.code || '').trim().toUpperCase();
  if (!code) throw ApiError.badRequest('code is required');
  if (!data.name || !data.name.trim()) throw ApiError.badRequest('name is required');

  const exists = await Product.findOne({ code });
  if (exists) throw ApiError.conflict(`A product with code ${code} already exists`);

  // No costRate here — a product is a price bucket; cost is derived from the
  // code (docs/07 R6). `codeNumber` is filled by the model's pre-save hook.
  const [product, setting] = await Promise.all([
    Product.create({
      code,
      name: data.name.trim(),
      category: data.category,
      saleRate: Number(data.saleRate) || 0,
      openingStock: Number(data.openingStock) || 0,
      openingDate: data.openingDate || undefined,
    }),
    getSetting(),
  ]);
  return serialize(product, setting);
}

export async function update(id, data) {
  const product = await findDoc(id);

  if (data.code !== undefined) {
    const code = String(data.code).trim().toUpperCase();
    if (!code) throw ApiError.badRequest('code cannot be empty');
    if (code !== product.code) {
      const clash = await Product.findOne({ code, _id: { $ne: product._id } });
      if (clash) throw ApiError.conflict(`A product with code ${code} already exists`);
      product.code = code;
    }
  }
  if (data.name !== undefined) product.name = String(data.name).trim();
  if (data.category !== undefined) product.category = data.category;
  if (data.saleRate !== undefined) product.saleRate = Number(data.saleRate) || 0;
  // No cost edit path: cost follows the code (docs/07 R6). To change a product's
  // cost the owner files it under a different code — that's the whole mechanism.
  if (data.openingStock !== undefined) product.openingStock = Number(data.openingStock) || 0;
  if (data.openingDate !== undefined) product.openingDate = data.openingDate || undefined;
  if (data.isActive !== undefined) product.isActive = Boolean(data.isActive);

  await product.save();
  return serialize(product, await getSetting());
}

export async function deactivate(id) {
  const product = await findDoc(id);
  product.isActive = false;
  await product.save();
  return serialize(product, await getSetting());
}
