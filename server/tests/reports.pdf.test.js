/**
 * Phase 7b — PDF endpoint test. Verifies the endpoint is wired and authed and
 * returns a real PDF. (Rendering fidelity is checked by eye; this just proves
 * the pipeline: Puppeteer loads the /print page and prints it.)
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { createApp } from '../src/app.js';
import env from '../src/config/env.js';
import User from '../src/models/User.js';
import { saveDraft, postByDate } from '../src/services/daybook.service.js';
import { closeBrowser } from '../src/services/pdf.service.js';
import { seedMasters, seedSetting, build0724Sections } from './fixtures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

let replset;
let server;
let baseURL;
let token;
let ids;

beforeAll(async () => {
  // The PDF renderer loads the built /print page, so build the current client.
  execSync('npm run build -w client', { cwd: REPO_ROOT, stdio: 'ignore' });

  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replset.getUri(), { dbName: 'reports_pdf_test' });

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
  const admin = await User.create({
    name: 'Admin',
    email: 'admin@test.local',
    passwordHash: 'x',
    role: 'ADMIN',
    permissions: { viewProfit: true },
  });
  token = jwt.sign({ sub: admin._id.toString(), role: 'ADMIN' }, env.jwtSecret);
});

describe('Report PDF', () => {
  it('GET /reports/daily-sale.pdf returns an authed, non-empty application/pdf', async () => {
    await saveDraft('2025-07-24', build0724Sections(ids));
    await postByDate('2025-07-24');

    // Unauthed → 401.
    const noAuth = await request(baseURL).get('/api/v1/reports/daily-sale.pdf?date=2025-07-24');
    expect(noAuth.status).toBe(401);

    // Authed → a real PDF.
    const res = await request(baseURL)
      .get('/api/v1/reports/daily-sale.pdf?date=2025-07-24')
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.body.length).toBeGreaterThan(1000);
    expect(res.body.slice(0, 5).toString()).toBe('%PDF-');
  }, 60000);

  it('GET /reports/position.pdf returns an authed, non-empty application/pdf', async () => {
    const { create } = await import('../src/services/party.service.js');
    const bank = await create({
      accountCode: '4101001',
      name: 'HBL Main',
      type: 'BANK',
      openingBalance: 100000,
      openingType: 'DR',
      openingDate: '2025-04-01',
    });
    const { addEntry } = await import('../src/services/bank.service.js');
    await addEntry(bank._id, { date: '2025-05-10', direction: 'DR', amount: 50000, narration: 'deposit' });

    const url = '/api/v1/reports/position.pdf?from=2025-04-01&to=2025-12-31';
    expect((await request(baseURL).get(url)).status).toBe(401);

    const res = await request(baseURL)
      .get(url)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.body.length).toBeGreaterThan(1000);
    expect(res.body.slice(0, 5).toString()).toBe('%PDF-');
  }, 60000);
});
