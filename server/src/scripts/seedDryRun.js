// Day-Zero seed for a hand dry-run: the 41 real product codes + opening cash +
// a few parties + two banks. Run AFTER reset:golive (which clears data + keeps
// the admin login). Idempotent on the master collections it owns.
import mongoose from 'mongoose';
import env from '../config/env.js';
import Product from '../models/Product.js';
import ExpenseHead from '../models/ExpenseHead.js';
import Setting from '../models/Setting.js';
import { create as createParty } from '../services/party.service.js';
import { CODE_NUMBERS, PRODUCT_OPENINGS, OPENING_TOTAL } from '../data/productOpenings.js';
import { getPartyBalance } from '../services/ledger.service.js';
import { karachiDay } from '../utils/shopDate.js';

const money = (n) => Number(n || 0).toLocaleString('en-US');
const OPEN_DATE = '2025-04-01'; // opening date for anything with a starting balance

async function run() {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
  try {
    // Wipe the master + transactional collections (NOT users) for a clean slate.
    for (const c of ['products', 'parties', 'expenseheads', 'daybooks', 'ledgerentries', 'stocktransactions']) {
      await mongoose.connection.collection(c).deleteMany({});
    }

    // Settings — opening cash + owner-confirmed rules.
    await Setting.updateOne(
      {},
      { $set: { openingCash: 260297, codeMultiplier: 50, purchaseProfitFormula: 'COST_MINUS_RATE', discountAppliesTo: 'CASH' } },
      { upsert: true }
    );

    // 41 real product codes with their opening stock (sum 2,804).
    for (const n of CODE_NUMBERS) {
      const code = `K${n}`;
      await Product.create({ code, name: `Cloth ${code}`, openingStock: PRODUCT_OPENINGS[n] ?? 0, openingDate: new Date(OPEN_DATE) });
    }

    // Expense heads (needed for the Day-1 expense line).
    for (const name of ['Rent', 'Electricity', 'Tea', 'Water', 'Hall Rent', 'Salary', 'Misc']) {
      await ExpenseHead.create({ name });
    }

    // Parties (account codes are auto-generated; dates required where a balance is given).
    const slmn = await createParty({ name: 'slmn azam', type: 'CUSTOMER', openingBalance: 0, openingType: 'DR' });
    const kamran = await createParty({ name: 'Kamran Fabrics', type: 'SUPPLIER', openingBalance: 80000, openingType: 'CR', openingDate: OPEN_DATE });
    const farhan = await createParty({ name: 'farhan malik', type: 'EMPLOYEE', openingBalance: 44118, openingType: 'CR', openingDate: OPEN_DATE });

    // Banks (plain opening amount, auto-Debit).
    const hbl = await createParty({ name: 'HBL', type: 'BANK', openingBalance: 560000, openingDate: OPEN_DATE });
    const meezan = await createParty({ name: 'Meezan', type: 'BANK', openingBalance: 160000, openingDate: OPEN_DATE });

    // ── Read the go-live position back ─────────────────────────────────────
    const today = karachiDay(new Date());
    const bal = async (p) => getPartyBalance(p._id, today);
    const [sB, kB, fB, hB, mB] = await Promise.all([bal(slmn), bal(kamran), bal(farhan), bal(hbl), bal(meezan)]);
    const stockTotal = OPENING_TOTAL;
    const receivable = [sB, kB, fB].filter((b) => b.side === 'DR').reduce((t, b) => t + b.amount, 0);
    const payable = [sB, kB, fB].filter((b) => b.side === 'CR').reduce((t, b) => t + b.amount, 0);
    const banksTotal = hB.signedBalance + mB.signedBalance;

    console.log('\n══════════ DAY-ZERO STARTING POSITION ══════════');
    console.log(`  Products:            ${CODE_NUMBERS.length} codes`);
    console.log(`  Total opening stock: ${money(stockTotal)}`);
    console.log(`  Opening cash:        ${money(260297)}`);
    console.log('  Parties:');
    console.log(`     slmn azam (customer):   ${sB.side === 'NONE' ? '0' : money(sB.amount) + ' ' + sB.side}`);
    console.log(`     Kamran Fabrics (supp.): ${money(kB.amount)} ${kB.side}`);
    console.log(`     farhan malik (employee):${money(fB.amount)} ${fB.side}`);
    console.log(`  Total receivable (Dr): ${money(receivable)}`);
    console.log(`  Total payable    (Cr): ${money(payable)}   (Kamran 80,000 + farhan 44,118)`);
    console.log('  Banks:');
    console.log(`     HBL:    ${money(hB.signedBalance)}`);
    console.log(`     Meezan: ${money(mB.signedBalance)}`);
    console.log(`  Total in banks: ${money(banksTotal)}`);
    console.log('════════════════════════════════════════════════\n');
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((e) => {
  console.error('[seedDryRun] Failed:', e.message);
  process.exit(1);
});
