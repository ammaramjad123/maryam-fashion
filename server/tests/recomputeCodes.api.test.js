/**
 * POST /products/recompute-codes — admin-only maintenance that re-derives every
 * product's stored codeNumber from its code (docs/07 R6). It exists to fix
 * point-value codes (e.g. K24.50) saved before the parser kept the decimal.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { createApp } from '../src/app.js';
import env from '../src/config/env.js';
import User from '../src/models/User.js';
import Product from '../src/models/Product.js';

const BASE = '/api/v1';
let replset;
let app;
let adminToken;
let operatorToken;

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replset.getUri(), { dbName: 'recompute_codes_test' });
  app = createApp();
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await replset?.stop();
});

beforeEach(async () => {
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) await c.deleteMany({});
  const admin = await User.create({
    name: 'Admin', email: 'a@t.local', passwordHash: 'x', role: 'ADMIN',
    permissions: { viewProfit: true },
  });
  const operator = await User.create({
    name: 'Op', email: 'o@t.local', passwordHash: 'x', role: 'OPERATOR',
    permissions: { viewProfit: false },
  });
  adminToken = jwt.sign({ sub: admin._id.toString(), role: 'ADMIN' }, env.jwtSecret);
  operatorToken = jwt.sign({ sub: operator._id.toString(), role: 'OPERATOR' }, env.jwtSecret);
});

describe('POST /products/recompute-codes', () => {
  it('is ADMIN-only (403 for an operator, 401 without a token)', async () => {
    await request(app).post(`${BASE}/products/recompute-codes`).expect(401);
    await request(app)
      .post(`${BASE}/products/recompute-codes`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(403);
  });

  it('corrects a stale point-value codeNumber and leaves good ones alone', async () => {
    const stale = await Product.create({ code: 'K24.50', name: 'Cloth' });
    await Product.updateOne({ _id: stale._id }, { $set: { codeNumber: 2450 } }); // pre-fix value
    const good = await Product.create({ code: 'K30', name: 'Cloth K30' });

    const res = await request(app)
      .post(`${BASE}/products/recompute-codes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data.changed).toBe(1);
    expect(res.body.data.fixed[0]).toMatchObject({ code: 'K24.50', was: 2450, now: 24.5 });
    expect((await Product.findById(stale._id)).codeNumber).toBe(24.5);
    expect((await Product.findById(good._id)).codeNumber).toBe(30);
  });
});
