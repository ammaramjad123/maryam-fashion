/**
 * The Day Book type-ahead (GET /products/search) must return the DERIVED costRate
 * so a line's profit shows even for a code the page hadn't cached at mount (e.g.
 * M101, added after the Day Book loaded, then picked from the dropdown). Without
 * it the P cell stays blank — the bug the shop reported for M101.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import Product from '../src/models/Product.js';
import { search } from '../src/services/product.service.js';

let replset;

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replset.getUri(), { dbName: 'product_search_test' });
});

afterAll(async () => {
  await mongoose.disconnect();
  await replset?.stop();
});

beforeEach(async () => {
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) await c.deleteMany({});
  await mongoose.connection.collection('settings').insertOne({ openingCash: 0, codeMultiplier: 50 });
});

describe('product search for the Day Book type-ahead', () => {
  it('returns the derived costRate (codeNumber × multiplier)', async () => {
    await Product.create({ code: 'M101', name: 'shirt', saleRate: 4000 });
    const [row] = await search({ q: 'M101' });
    expect(row.code).toBe('M101');
    expect(row.costRate).toBe(5050); // 101 × 50
    expect(row.saleRate).toBe(4000);
  });
});
