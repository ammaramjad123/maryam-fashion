import readline from 'readline';
import mongoose from 'mongoose';
import env from '../config/env.js';
import { resetForGoLive } from '../services/golive.service.js';

/**
 * ⚠️  DESTRUCTIVE — wipes ALL transactional data and demo masters so the shop
 * can start clean for go-live. User accounts are kept (you can still log in).
 *
 * Requires you to TYPE the exact phrase  RESET GO-LIVE  to proceed. There is no
 * --force flag on purpose. Take a backup first:  ./scripts/backup.sh
 */
const PHRASE = 'RESET GO-LIVE';

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => (rl.close(), resolve(a))));
}

async function run() {
  console.log('\n⚠️  This will PERMANENTLY DELETE all day books, ledger entries, stock');
  console.log('   transactions, and the products / parties / expense heads.');
  console.log('   User logins are kept. Make sure you have a backup (./scripts/backup.sh).\n');

  const answer = await ask(`Type "${PHRASE}" to proceed (anything else cancels): `);
  if (answer.trim() !== PHRASE) {
    console.log('Cancelled — nothing was changed.');
    process.exit(0);
  }

  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
  try {
    const counts = await resetForGoLive();
    console.log('\n✅ Reset complete. Deleted:');
    for (const [k, v] of Object.entries(counts)) console.log(`   ${k}: ${v}`);
    console.log('\nNext: enter your opening stock, opening cash and party/bank openings,');
    console.log('then run:  npm run golive:verify -w server\n');
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error('[reset:golive] Failed:', err.message);
  process.exit(1);
});
