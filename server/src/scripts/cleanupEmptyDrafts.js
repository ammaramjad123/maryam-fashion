import mongoose from 'mongoose';
import env from '../config/env.js';
import DayBook from '../models/DayBook.js';
import { isEmptyDay } from '../utils/dayBookEmpty.js';
import { karachiDay } from '../utils/shopDate.js';

/**
 * One-off cleanup: delete every DRAFT DayBook that has zero lines across all five
 * sections. These were created by the old "create-on-view" behaviour and could
 * block posting via the no-gap rule. Posted days and drafts with real content are
 * never touched. Safe and idempotent — run it as often as you like.
 */
async function run() {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
  try {
    const drafts = await DayBook.find({ status: 'DRAFT' }).lean();
    const empties = drafts.filter(isEmptyDay);

    if (empties.length === 0) {
      console.log('[cleanup] No empty drafts found. Nothing to remove.');
      return;
    }

    const ids = empties.map((d) => d._id);
    const res = await DayBook.deleteMany({ _id: { $in: ids } });

    console.log(`[cleanup] Removed ${res.deletedCount} empty draft day book(s):`);
    for (const d of empties) console.log(`   • ${karachiDay(d.date)}  (page ${d.pageNo ?? '—'})`);
    console.log('[cleanup] Posted days and drafts with real content were left untouched.');
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error('[cleanup] Failed:', err.message);
  process.exit(1);
});
