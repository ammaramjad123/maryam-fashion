import mongoose from 'mongoose';
import env from '../config/env.js';
import { recomputeCodeNumbers } from '../services/golive.service.js';

/**
 * Re-derive every product's stored codeNumber from its code (docs/07 R6).
 * Fixes point-value codes entered before the parser kept the decimal point
 * (e.g. 'K24.50' had been stored as 2450 → 50× cost). Idempotent; read-mostly.
 * Backup first if unsure: ./scripts/backup.sh
 */
async function run() {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
  try {
    const res = await recomputeCodeNumbers();
    console.log(`\nScanned ${res.scanned} product(s); fixed ${res.changed}.`);
    for (const f of res.fixed) console.log(`  ${f.code}: ${f.was} → ${f.now}`);
    console.log('');
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error('[recompute:codes] Failed:', err.message);
  process.exit(1);
});
