import mongoose from 'mongoose';
import env from '../config/env.js';
import Party from '../models/Party.js';
import Product from '../models/Product.js';
import ExpenseHead from '../models/ExpenseHead.js';
import LedgerEntry from '../models/LedgerEntry.js';
import { CODE_NUMBERS, PRODUCT_OPENINGS } from '../data/productOpenings.js';

/**
 * Seed the master data with the real product codes / cost rates and a few
 * parties (including farhan malik). Idempotent: existing records (matched by
 * their unique key) are skipped, never overwritten — so manual edits survive.
 */

// A product is a PRICE BUCKET — the code number IS the cost (docs/07 R6), so no
// cost is stored (it is derived, codeNumber × 50). We seed exactly the 41 codes
// the real shop uses, with their real opening stocks (single source of truth in
// data/productOpenings.js; they sum to 2,804). Admins can add new codes.
const PRODUCTS = CODE_NUMBERS.map((n) => {
  const code = `K${n}`;
  return { code, name: `Cloth ${code}`, openingStock: PRODUCT_OPENINGS[n] ?? 0 };
});

// accountCode convention: 11xx customers, 22xx employees, 31xx suppliers.
const PARTIES = [
  {
    accountCode: '2201001',
    name: 'farhan malik account',
    type: 'EMPLOYEE',
    openingBalance: 44118,
    openingType: 'CR',
  },
  {
    accountCode: '2201002',
    name: 'salman malik',
    type: 'EMPLOYEE',
    openingBalance: 0,
    openingType: 'CR',
  },
  {
    accountCode: '1101001',
    name: 'slmn azam',
    type: 'CUSTOMER',
    openingBalance: 0,
    openingType: 'DR',
  },
  {
    accountCode: '3101001',
    name: 'kamran fabrics',
    type: 'SUPPLIER',
    openingBalance: 0,
    openingType: 'CR',
  },
];

const EXPENSE_HEADS = [
  'Rent',
  'Hall Rent',
  'Electricity',
  'Tea',
  'Water',
  'Safai',
  'Gaurd',
  'Masjid',
  'Boys Exp',
  'Computer Repair',
  'Salary',
  'Misc',
];

async function seedProducts() {
  let created = 0;
  for (const p of PRODUCTS) {
    const code = p.code.toUpperCase();
    if (await Product.findOne({ code })) continue;
    await Product.create({
      ...p,
      code,
      saleRate: p.saleRate ?? 0,
      openingStock: p.openingStock ?? 0,
      openingDate: new Date('2025-04-01'),
    });
    created += 1;
  }
  console.log(`[seed] Products: ${created} created, ${PRODUCTS.length - created} skipped.`);
}

async function seedParties() {
  let created = 0;
  for (const party of PARTIES) {
    if (await Party.findOne({ accountCode: party.accountCode })) continue;
    const doc = await Party.create({ ...party, openingDate: new Date('2025-04-01') });
    // An opening balance is a real OP ledger entry (docs/07 R1), so it shows up
    // in balances/reports — mirrors party.service.create.
    if (doc.openingBalance) {
      await LedgerEntry.create({
        partyId: doc._id,
        date: doc.openingDate,
        voucherType: 'OP',
        voucherNo: 0,
        narration: 'Opening balance',
        debit: doc.openingType === 'DR' ? doc.openingBalance : 0,
        credit: doc.openingType === 'CR' ? doc.openingBalance : 0,
        sourceType: 'OPENING',
      });
    }
    created += 1;
  }
  console.log(`[seed] Parties: ${created} created, ${PARTIES.length - created} skipped.`);
}

async function seedExpenseHeads() {
  let created = 0;
  for (const name of EXPENSE_HEADS) {
    if (await ExpenseHead.findOne({ name: new RegExp(`^${name}$`, 'i') })) continue;
    await ExpenseHead.create({ name });
    created += 1;
  }
  console.log(
    `[seed] Expense heads: ${created} created, ${EXPENSE_HEADS.length - created} skipped.`
  );
}

async function run() {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
  try {
    await seedProducts();
    await seedParties();
    await seedExpenseHeads();
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error('[seed] Failed:', err.message);
  process.exit(1);
});
