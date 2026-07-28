/**
 * Phase 8 — role stripping is a SECURITY boundary, so test it hard. With an
 * OPERATOR token (viewProfit:false) every response — JSON and PDF — must be free
 * of profit / costRate / a P column. With an ADMIN token nothing is stripped.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import ExcelJS from 'exceljs';

import { createApp } from '../src/app.js';
import env from '../src/config/env.js';
import User from '../src/models/User.js';
import { saveDraft, postByDate } from '../src/services/daybook.service.js';
import { getStock } from '../src/services/stock.service.js';
import { karachiDay } from '../src/utils/shopDate.js';
import { closeBrowser } from '../src/services/pdf.service.js';
import { seedMasters, seedSetting, build0724Sections } from './fixtures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

let replset;
let server;
let baseURL;
let adminToken;
let operatorToken;
let ids;

const get = (p, token) => request(baseURL).get(p).set('Authorization', `Bearer ${token}`);

// Raw PDF bytes → latin1 string, so we can scan for leaked text.
async function pdfText(p, token) {
  const res = await get(p, token)
    .buffer(true)
    .parse((r, cb) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
  return {
    status: res.status,
    type: res.headers['content-type'],
    text: res.body.toString('latin1'),
  };
}

function assertProfitFree(label, text) {
  expect(text, `${label} must not leak 'profit'`).not.toContain('profit');
  expect(text, `${label} must not leak 'costRate'`).not.toContain('costRate');
  expect(text, `${label} must not leak a ' P ' column`).not.toContain(' P ');
}

// Load an .xlsx response and return every cell value as a flat array of strings.
async function xlsxCells(p, token) {
  const res = await get(p, token)
    .buffer(true)
    .parse((r, cb) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(res.body);
  const values = [];
  wb.worksheets.forEach((ws) =>
    ws.eachRow((row) => row.eachCell((cell) => values.push(String(cell.value))))
  );
  return { status: res.status, type: res.headers['content-type'], values };
}

beforeAll(async () => {
  execSync('npm run build -w client', { cwd: REPO_ROOT, stdio: 'ignore' });
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replset.getUri(), { dbName: 'roles_api_test' });
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseURL = `http://127.0.0.1:${server.address().port}`;
}, 180000);

afterAll(async () => {
  await closeBrowser().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await replset?.stop();
});

beforeEach(async () => {
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) await c.deleteMany({});
  ids = await seedMasters();
  await seedSetting(260297);
  await saveDraft('2025-07-24', build0724Sections(ids));
  await postByDate('2025-07-24');

  const admin = await User.create({
    name: 'Admin',
    email: 'admin@test.local',
    passwordHash: 'x',
    role: 'ADMIN',
    permissions: { viewProfit: true },
  });
  const operator = await User.create({
    name: 'Operator',
    email: 'op@test.local',
    passwordHash: 'x',
    role: 'OPERATOR',
    permissions: { viewProfit: false },
  });
  adminToken = jwt.sign({ sub: admin._id.toString(), role: 'ADMIN' }, env.jwtSecret);
  operatorToken = jwt.sign({ sub: operator._id.toString(), role: 'OPERATOR' }, env.jwtSecret);
});

describe('Role stripping (viewProfit)', () => {
  it('OPERATOR gets profit-free JSON from every endpoint', async () => {
    for (const p of [
      '/api/v1/daybook/2025-07-24',
      '/api/v1/reports/daily-sale?date=2025-07-24',
      '/api/v1/reports/daily-stock?date=2025-07-24',
      '/api/v1/dashboard?date=2025-07-24',
      '/api/v1/products?limit=100',
    ]) {
      const res = await get(p, operatorToken);
      expect(res.status, p).toBe(200);
      assertProfitFree(p, res.text);
    }
  });

  it('OPERATOR gets profit-free PDFs', async () => {
    const sale = await pdfText('/api/v1/reports/daily-sale.pdf?date=2025-07-24', operatorToken);
    expect(sale.status).toBe(200);
    expect(sale.type).toBe('application/pdf');
    assertProfitFree('daily-sale.pdf', sale.text);

    const stock = await pdfText('/api/v1/reports/daily-stock.pdf?date=2025-07-24', operatorToken);
    expect(stock.status).toBe(200);
    assertProfitFree('daily-stock.pdf', stock.text);
  });

  it('OPERATOR gets profit-free XLSX; ADMIN keeps the profit columns', async () => {
    // Operator: no 'P' header, no 'Profit'/'Total Profit' anywhere in the workbook.
    for (const p of [
      '/api/v1/reports/daily-sale.xlsx?date=2025-07-24',
      '/api/v1/reports/daily-stock.xlsx?date=2025-07-24',
    ]) {
      const { status, type, values } = await xlsxCells(p, operatorToken);
      expect(status, p).toBe(200);
      expect(type, p).toContain('spreadsheetml.sheet');
      expect(values, `${p} must not have a 'P' column`).not.toContain('P');
      expect(
        values.some((v) => v.toLowerCase().includes('profit')),
        `${p} must not leak profit`
      ).toBe(false);
    }

    // Admin: the daily-sale workbook keeps the profit summary.
    const admin = await xlsxCells('/api/v1/reports/daily-sale.xlsx?date=2025-07-24', adminToken);
    expect(admin.values).toContain('P');
    expect(admin.values).toContain('Total Profit');
  });

  it('ADMIN sees profit and costRate everywhere (nothing stripped)', async () => {
    const day = await get('/api/v1/daybook/2025-07-24', adminToken);
    expect(day.text).toContain('profit');
    expect(day.text).toContain('costRate');

    const sale = await get('/api/v1/reports/daily-sale?date=2025-07-24', adminToken);
    expect(sale.text).toContain('profit');

    const products = await get('/api/v1/products?limit=100', adminToken);
    expect(products.text).toContain('costRate');

    const dash = await get('/api/v1/dashboard?date=2025-07-24', adminToken);
    expect(dash.text).toContain('profit');
  });

  it('GET /stock/current shows DERIVED stock (K30 628), NOT the stored openingStock (551)', async () => {
    // 24/07 is posted in beforeEach with a K30 sale of −77 → current stock 628.
    const res = await get('/api/v1/stock/current', adminToken);
    expect(res.status).toBe(200);
    const k30 = res.body.data.items.find((r) => r.code === 'K30');
    expect(k30.stock).toBe(628); // derived (getStock), not openingStock 551
    expect(k30.stock).not.toBe(551);
    // Admin sees the derived cost; the row carries no `unit` field any more.
    expect(k30.costRate).toBe(1500);
    expect(k30).not.toHaveProperty('unit');
  });

  it('OPERATOR /stock/current is stock-only (no cost leaks)', async () => {
    const res = await get('/api/v1/stock/current', operatorToken);
    expect(res.status).toBe(200);
    const k30 = res.body.data.items.find((r) => r.code === 'K30');
    expect(k30.stock).toBe(628);
    expect(k30.costRate).toBeUndefined(); // profitFilter strips cost for operators
  });

  it('/reports/profit is 403 for OPERATOR, 200 for ADMIN', async () => {
    expect((await get('/api/v1/reports/profit', operatorToken)).status).toBe(403);
    const admin = await get('/api/v1/reports/profit', adminToken);
    expect(admin.status).toBe(200);
    expect(admin.body.data.totalProfit).toBe(-6100);
  });

  it('stock adjustment: ADMIN adjusts and getStock reflects it; OPERATOR is 403', async () => {
    const today = karachiDay(new Date());
    const before = await getStock(ids.products.K30._id, today); // 628 (24/07 posted)
    expect(before).toBe(628);

    const forbidden = await request(baseURL)
      .post('/api/v1/stock/adjustment')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ productId: ids.products.K30._id, direction: 'IN', qty: 100, reason: 'x' });
    expect(forbidden.status).toBe(403);

    const ok = await request(baseURL)
      .post('/api/v1/stock/adjustment')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId: ids.products.K30._id, direction: 'IN', qty: 100, reason: 'counting fix' });
    expect(ok.status).toBe(201);

    const after = await getStock(ids.products.K30._id, today);
    expect(after).toBe(728);
  });

  it('a reason is mandatory for a stock adjustment', async () => {
    const res = await request(baseURL)
      .post('/api/v1/stock/adjustment')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId: ids.products.K30._id, direction: 'OUT', qty: 5, reason: '' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/reason/i);
  });
});
