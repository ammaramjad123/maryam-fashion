import mongoose from 'mongoose';
import env from '../config/env.js';
import { zeroBankOpenings } from '../services/golive.service.js';

/**
 * Zero the bank accounts — clears each bank's opening balance (drops its OPENING
 * ledger entry and sets openingBalance to 0) so its derived balance becomes 0.
 * Banks themselves are KEPT. User logins and everything else are untouched.
 * Non-interactive: no confirmation phrase (it only zeros banks). Backup first if
 * unsure: ./scripts/backup.sh
 */
async function run() {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
  try {
    const res = await zeroBankOpenings();
    console.log('\n✅ Banks zeroed:');
    for (const [k, v] of Object.entries(res)) console.log(`   ${k}: ${v}`);
    console.log('');
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error('[zero:banks] Failed:', err.message);
  process.exit(1);
});
