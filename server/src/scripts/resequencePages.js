import mongoose from 'mongoose';
import env from '../config/env.js';
import DayBook from '../models/DayBook.js';
import { karachiDay } from '../utils/shopDate.js';

/**
 * Re-sequence register page numbers so they follow DATE order (not the order days
 * were created/browsed). POSTED days are numbered by ascending date starting from
 * the smallest page currently in use (floor 220 — the real book's start). DRAFT
 * days have their page number cleared (a page is assigned only at post time).
 * Idempotent and safe.
 */
async function run() {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
  try {
    const posted = await DayBook.find({ status: 'POSTED' }).sort({ date: 1 });
    const existing = posted.map((d) => d.pageNo).filter((n) => n != null);
    const start = existing.length ? Math.min(...existing, 220) : 220;

    let n = start;
    const changes = [];
    for (const d of posted) {
      if (d.pageNo !== n) {
        changes.push(`${karachiDay(d.date)}: ${d.pageNo ?? '—'} → ${n}`);
        d.pageNo = n;
        await d.save();
      }
      n += 1;
    }

    const cleared = await DayBook.updateMany(
      { status: 'DRAFT', pageNo: { $ne: null } },
      { $unset: { pageNo: '' } }
    );

    console.log(`[resequence] Posted days re-sequenced from page ${start} by date.`);
    if (changes.length) changes.forEach((c) => console.log(`   • ${c}`));
    else console.log('   • already in order — no posted day changed.');
    console.log(`[resequence] Cleared page number on ${cleared.modifiedCount} draft(s).`);

    const check = await DayBook.findOne({
      status: 'POSTED',
      date: { $gte: new Date('2025-07-24T00:00:00+05:00'), $lt: new Date('2025-07-25T00:00:00+05:00') },
    })
      .select('pageNo')
      .lean();
    if (check) console.log(`[resequence] 24/07/2025 is now page ${check.pageNo}.`);
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error('[resequence] Failed:', err.message);
  process.exit(1);
});
