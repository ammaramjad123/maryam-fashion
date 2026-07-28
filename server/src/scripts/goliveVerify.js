import mongoose from 'mongoose';
import env from '../config/env.js';
import { goLiveSummary } from '../services/golive.service.js';

// Read the opening position back so the owner can confirm it against his
// physical count BEFORE going live. Exits non-zero if there are warnings, so it
// works as a go/no-go gate. Read-only — safe to run anytime.

const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const drcr = (p) => (p.side === 'NONE' || !p.amount ? '0' : `${money(p.amount)} ${p.side}`);

async function run() {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
  try {
    const s = await goLiveSummary();

    console.log('\n══════════ Day-Zero position ══════════');
    console.log(`As of:            ${s.date}`);
    console.log(`Products:         ${s.counts.products}   (Opening stock total: ${money(s.openingStockTotal)})`);
    console.log(`Opening cash:     ${money(s.openingCash)}`);
    console.log(`Parties:          ${s.counts.parties}    Banks: ${s.counts.banks}    Expense heads: ${s.counts.expenseHeads}`);

    const printOpenings = (title, rows) => {
      const withBal = rows.filter((r) => r.amount);
      if (!withBal.length) return;
      console.log(`\n${title}`);
      for (const r of withBal) {
        console.log(`   ${r.name.padEnd(28)} ${r.accountCode.padEnd(10)} ${drcr(r).padStart(16)}  opened ${r.openingDate || '—'}`);
      }
    };
    printOpenings('Party openings (jin se lena/dena hai):', s.parties);
    printOpenings('Bank openings:', s.banks);

    if (s.warnings.length) {
      console.log('\n⚠️  Please review:');
      for (const w of s.warnings) console.log(`   • ${w}`);
      console.log('\n→ Fix the items above, then run this again.\n');
      process.exitCode = 1;
    } else {
      console.log('\n✅ Looks consistent. Confirm the opening stock total and opening cash');
      console.log('   against your physical count, then start posting your first day.\n');
    }
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error('[golive:verify] Failed:', err.message);
  process.exit(1);
});
