import mongoose from 'mongoose';
import env from '../config/env.js';
import Party from '../models/Party.js';
import Product from '../models/Product.js';
import ExpenseHead from '../models/ExpenseHead.js';
import LedgerEntry from '../models/LedgerEntry.js';
import Setting from '../models/Setting.js';
import DayBook from '../models/DayBook.js';
import { saveDraft, postByDate } from '../services/daybook.service.js';
import { create as createParty } from '../services/party.service.js';
import { addEntry as addBankEntry } from '../services/bank.service.js';
import { dayStart, nextDayStart } from '../utils/shopDate.js';

/**
 * Demo data for a review/click-tour on top of seed:masters + seed:admin.
 * Idempotent — every section is skipped if it already exists, so it's safe to
 * re-run. Recreates: opening cash, the real 24/07 sheet (page 220, posted) and a
 * 25/07 draft, farhan's April ledger + salary accruals, and two bank accounts.
 */
async function run() {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
  try {
    // 1. Settings — opening cash + owner-confirmed rules.
    await Setting.updateOne(
      {},
      { $set: { openingCash: 260297, codeMultiplier: 50, purchaseProfitFormula: 'COST_MINUS_RATE' } },
      { upsert: true }
    );

    const farhan = await Party.findOne({ name: 'farhan malik account' });
    const salman = await Party.findOne({ name: 'salman malik' });

    // 2. Farhan April activity (docs/07 R1) + salary accruals so employees read
    //    as payables on the dashboard.
    const dv = (pid, amt, date, no) => ({ partyId: pid, date: new Date(date), voucherType: 'DV', voucherNo: no, narration: 'salary', debit: amt, credit: 0, sourceType: 'DAYBOOK' });
    const jv = (pid, amt, date, no) => ({ partyId: pid, date: new Date(date), voucherType: 'JV', voucherNo: no, narration: 'salary', debit: 0, credit: amt, sourceType: 'JOURNAL' });
    if (farhan && salman && !(await LedgerEntry.findOne({ partyId: farhan._id, voucherNo: 3890 }))) {
      await LedgerEntry.insertMany([
        dv(farhan._id, 44000, '2025-04-08T00:00:00+05:00', 3890),
        jv(farhan._id, 42666, '2025-04-30T00:00:00+05:00', 82),
        jv(farhan._id, 42666, '2025-07-20T00:00:00+05:00', 90),
        jv(salman._id, 45000, '2025-07-20T00:00:00+05:00', 91),
      ]);
      console.log('[demo] farhan/salman ledger entries added');
    }

    // 3. The real 24/07 sheet (page 220), posted; a 25/07 draft to show reminders.
    const posted = await DayBook.findOne({
      status: 'POSTED',
      date: { $gte: dayStart('2025-07-24'), $lt: nextDayStart('2025-07-24') },
    });
    if (!posted) {
      const prod = {};
      for (const c of ['K44', 'K30', 'K64', 'K40', 'K32', 'K50']) prod[c] = (await Product.findOne({ code: c }))._id;
      const pty = {};
      for (const n of ['slmn azam', 'farhan malik account', 'salman malik']) pty[n] = (await Party.findOne({ name: n }))._id;
      const head = {};
      for (const n of ['masjid', 'gaurd', 'safai', 'boys exp', 'hall rent', 'tea', 'stall khana', 'water', 'computer rprng', 'slmn mill kraya']) {
        const h = await ExpenseHead.findOne({ name: new RegExp(`^${n}$`, 'i') });
        head[n] = h ? h._id : (await ExpenseHead.create({ name: n }))._id;
      }
      const sale = (c, pk, qty, rate, billNo) => ({ billNo, productId: prod[c], partyId: pk ? pty[pk] : null, qty, rate });
      await saveDraft('2025-07-24', {
        pageNo: 220,
        discountOnSale: 0,
        // Real 24/07 line order (docs/07 R9.1): cash bill 12037, then the slmn
        // azam credit block (ONE bill, number 12038 on its first row only, the
        // rest blank), then the last cash bill 12039.
        sales: [
          sale('K44', null, 1, 2200, 12037), // cash → bill 12037
          sale('K44', 'slmn azam', 50, 2000, 12038), // credit block starts → 12038
          sale('K64', 'slmn azam', 6, 2700), // continuation → blank
          sale('K40', 'slmn azam', 15, 1800),
          sale('K30', 'slmn azam', -77, 1400),
          sale('K32', 'slmn azam', -6, 1450),
          sale('K40', 'slmn azam', -3, 1800),
          sale('K30', 'slmn azam', -3, 1400),
          sale('K50', 'slmn azam', -2, 2300),
          sale('K30', null, 3, 1500, 12039), // cash → bill 12039 (last line)
        ],
        purchases: [],
        receipts: [],
        payments: [
          { partyId: pty['farhan malik account'], narration: 'salary', amount: 45000 },
          { partyId: pty['salman malik'], narration: 'salary', amount: 45000 },
        ],
        expenses: [
          { expenseHeadId: head.masjid, narration: 'masjid', amount: 5000 },
          { expenseHeadId: head.gaurd, narration: 'gaurd', amount: 1000 },
          { expenseHeadId: head.safai, narration: 'safai', amount: 1000 },
          { expenseHeadId: head['boys exp'], narration: 'boys exp', amount: 7140 },
          { expenseHeadId: head['hall rent'], narration: 'hall rent', amount: 73000 },
          { expenseHeadId: head.tea, narration: 'tea', amount: 1250 },
          { expenseHeadId: head['stall khana'], narration: 'stall khana', amount: 500 },
          { expenseHeadId: head.water, narration: 'water', amount: 1050 },
          { expenseHeadId: head['computer rprng'], narration: 'computer rprng', amount: 2500 },
          { expenseHeadId: head['slmn mill kraya'], narration: 'slmn mill kraya', amount: 400 },
        ],
      });
      await postByDate('2025-07-24');
      await saveDraft('2025-07-25', {
        discountOnSale: 0,
        sales: [sale('K30', null, 5, 1600, 12047), sale('K64', 'slmn azam', 4, 3000, 12048)],
        purchases: [],
        receipts: [],
        payments: [],
        expenses: [],
      });
      console.log('[demo] 24/07 posted (page 220), 25/07 draft saved');
    }

    // 4. Bank accounts (docs/07 R9.3) — a separate ledger.
    if (!(await Party.findOne({ accountCode: '4101001' }))) {
      const hbl = await createParty({ accountCode: '4101001', name: 'HBL Main', type: 'BANK', openingBalance: 500000, openingType: 'DR', openingDate: '2025-04-01' });
      await addBankEntry(hbl._id, { date: '2025-05-10', narration: 'cash deposit', direction: 'DR', amount: 150000 });
      await addBankEntry(hbl._id, { date: '2025-05-20', narration: 'supplier cheque', direction: 'CR', amount: 90000 });
      const mzn = await createParty({ accountCode: '4101002', name: 'Meezan Current', type: 'BANK', openingBalance: 120000, openingType: 'DR', openingDate: '2025-04-01' });
      await addBankEntry(mzn._id, { date: '2025-06-01', narration: 'transfer in', direction: 'DR', amount: 40000 });
      console.log('[demo] bank accounts created');
    }

    console.log('[demo] done.');
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error('[demo] Failed:', err.message);
  process.exit(1);
});
