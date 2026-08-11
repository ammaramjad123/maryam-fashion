import readline from 'readline';
import mongoose from 'mongoose';
import env from '../config/env.js';
import { resetKeepParties } from '../services/golive.service.js';

/**
 * ⚠️  DESTRUCTIVE — "everything to zero EXCEPT parties". Wipes all transactional
 * data (day books, posted ledger entries, stock movements) and zeros opening
 * stock + opening cash, but KEEPS every party and bank exactly as they are
 * (their opening balances survive). Products are kept too (with stock 0) — prune
 * the dead codes by hand on the Products screen.
 *
 * User logins are kept. Take a backup first:  ./scripts/backup.sh
 *
 * Requires the exact phrase  RESET KEEP PARTIES  — pass it as the first CLI arg
 * for a non-interactive run, otherwise you'll be prompted.
 */
const PHRASE = 'RESET KEEP PARTIES';

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => (rl.close(), resolve(a))));
}

async function run() {
  console.log('\n⚠️  This will PERMANENTLY DELETE all day books, posted ledger entries and');
  console.log('   stock movements, and zero opening stock + opening cash.');
  console.log('   PARTIES (and banks) and their opening balances are KEPT. Products are kept');
  console.log('   with stock 0. User logins are kept. Backup first: ./scripts/backup.sh\n');

  const provided = process.argv[2];
  const answer = provided != null ? provided : await ask(`Type "${PHRASE}" to proceed (anything else cancels): `);
  if (String(answer).trim() !== PHRASE) {
    console.log('Cancelled — nothing was changed.');
    process.exit(0);
  }

  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
  try {
    const counts = await resetKeepParties();
    console.log('\n✅ Reset complete (parties kept):');
    for (const [k, v] of Object.entries(counts)) console.log(`   ${k}: ${v}`);
    console.log('\nNext: set the real opening cash and each product\'s opening stock,');
    console.log('then run:  npm run golive:verify -w server\n');
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error('[reset:keep-parties] Failed:', err.message);
  process.exit(1);
});
