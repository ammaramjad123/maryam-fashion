import mongoose from 'mongoose';
import env from '../config/env.js';
import { deleteAllBanks } from '../services/golive.service.js';

/**
 * HARD delete all bank accounts so the owner can add his own from scratch.
 * Guarded: refuses if any bank still has ledger entries (run zero:banks first).
 * User logins and everything else are untouched. Backup first if unsure:
 * ./scripts/backup.sh
 */
async function run() {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
  try {
    const res = await deleteAllBanks();
    console.log(`\n✅ Deleted ${res.removed} bank(s): ${res.names.join(', ') || '(none)'}\n`);
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error('[delete:banks] Failed:', err.message);
  process.exit(1);
});
