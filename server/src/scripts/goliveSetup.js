import readline from 'readline';
import mongoose from 'mongoose';
import env from '../config/env.js';
import { goLiveSummary, setOpeningCash } from '../services/golive.service.js';
import { create as createParty } from '../services/party.service.js';

/**
 * Guided Day-Zero setup. Products with opening stock are entered in the app.
 * This script walks the two things best done as simple prompts — the PARTIES
 * (who owes us / whom we owe) and the OPENING CASH — then reads the whole
 * opening position back for the owner to check against his old ledger.
 *
 * Parties are identified by NAME only — no account code is asked for (it is
 * generated silently). Direction is in plain language + Urdu.
 */
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => (rl.close(), resolve(a))));
}
const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const TYPE_MAP = { 1: 'CUSTOMER', 2: 'SUPPLIER', 3: 'EMPLOYEE', 4: 'BANK' };

async function partiesStep() {
  console.log('\n─────────── Parties (opening balances) ───────────');
  console.log('Add each party. You enter only: name, type, amount, direction, date.');
  console.log('Direction:');
  console.log('   d = Dr — jin se lena hai (جن سے لینا ہے)   [they owe us]');
  console.log('   c = Cr — jin ko dena hai (جن کو دینا ہے)   [we owe them]');
  console.log('Leave the name blank to finish.\n');

  let added = 0;
  for (;;) {
    const name = (await ask('Party name (blank = done): ')).trim();
    if (!name) break;

    const type = TYPE_MAP[(await ask('  Type — 1 Customer · 2 Supplier · 3 Employee · 4 Bank: ')).trim()];
    if (!type) {
      console.log('  ✖ pick 1–4 — not added.\n');
      continue;
    }
    const amount = Math.abs(Number((await ask('  Amount (0 if none): ')).trim()) || 0);

    let openingType = 'DR';
    let openingDate;
    if (amount > 0) {
      const dir = (await ask('  Direction — d = Dr (jin se lena hai) · c = Cr (jin ko dena hai): '))
        .trim()
        .toLowerCase();
      openingType = dir.startsWith('d') ? 'DR' : dir.startsWith('c') ? 'CR' : null;
      if (!openingType) {
        console.log('  ✖ enter d or c — not added.\n');
        continue;
      }
      openingDate = (await ask('  Opening date (YYYY-MM-DD): ')).trim();
    }

    try {
      await createParty({ name, type, openingBalance: amount, openingType, openingDate: openingDate || undefined });
      added += 1;
      const tag = amount > 0 ? ` — ${money(amount)} ${openingType}` : '';
      console.log(`  ✔ ${name} (${type.toLowerCase()})${tag}\n`);
    } catch (e) {
      console.log(`  ✖ ${e.message} — not added.\n`);
    }
  }
  console.log(`Parties added this session: ${added}`);
}

async function run() {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
  try {
    console.log('\n───────── Day-Zero (Pehla din) setup ─────────');
    console.log('Products & their opening stock are entered on the Products screen.');
    console.log('This step covers parties and the opening cash.');

    await partiesStep();

    const before = await goLiveSummary();
    console.log(`\nCurrent opening cash: ${money(before.openingCash)}`);
    const amt = await ask('Enter opening cash in the drawer (blank = keep current): ');
    if (amt.trim() !== '') {
      const value = await setOpeningCash(amt.trim());
      console.log(`✔ Opening cash set to ${money(value)}`);
    }

    // Read the position back — totals for the owner to check against his ledger.
    const s = await goLiveSummary();
    const totalReceivable = s.parties.filter((p) => p.side === 'DR').reduce((t, p) => t + p.amount, 0);
    const totalPayable = s.parties.filter((p) => p.side === 'CR').reduce((t, p) => t + p.amount, 0);

    console.log('\n══════════ Confirm your opening position ══════════');
    console.log(`Opening stock total: ${money(s.openingStockTotal)}  (across ${s.counts.products} codes)`);
    console.log(`Opening cash:        ${money(s.openingCash)}`);
    console.log(`Parties: ${s.counts.parties}   Banks: ${s.counts.banks}`);
    console.log('');
    console.log(`Total receivable (Dr · jin se lena hai / جن سے لینا ہے): ${money(totalReceivable)}`);
    console.log(`Total payable    (Cr · jin ko dena hai / جن کو دینا ہے): ${money(totalPayable)}`);
    if (s.warnings.length) {
      console.log('\n⚠️  Still to fix:');
      for (const w of s.warnings) console.log(`   • ${w}`);
    } else {
      console.log('\n✅ Ready. Check these against your old ledger, then post day one.');
    }
    console.log('\nFull readback anytime:  npm run golive:verify -w server\n');
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error('[golive:setup] Failed:', err.message);
  process.exit(1);
});
