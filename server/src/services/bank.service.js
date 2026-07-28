import mongoose from 'mongoose';
import Party from '../models/Party.js';
import LedgerEntry from '../models/LedgerEntry.js';
import ApiError from '../utils/ApiError.js';
import { getPartyBalance } from './ledger.service.js';
import { karachiDay } from '../utils/shopDate.js';

// Bank accounts are parties with type BANK (docs/07 R9.3). They reuse the SAME
// LedgerEntry stream and getPartyBalance as any party — no new balance math.
// The only thing special here is that entries are recorded DIRECTLY on the bank
// (voucherType 'BV', sourceType 'BANK'), never via the Day Book, so they can
// never touch a shop total.

async function getBank(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Bank account not found');
  const bank = await Party.findById(id);
  if (!bank || bank.type !== 'BANK') throw ApiError.notFound('Bank account not found');
  return bank;
}

// All bank accounts with their running balance as of today (engine).
export async function listBanks() {
  const banks = await Party.find({ type: 'BANK', isActive: true }).sort({ name: 1 }).lean();
  const today = karachiDay(new Date());
  const out = [];
  for (const b of banks) out.push({ ...b, balance: await getPartyBalance(b._id, today) });
  return out;
}

// Next BV voucher number for a bank (a simple per-account running series).
async function nextVoucherNo(partyId) {
  const last = await LedgerEntry.findOne({ partyId, voucherType: 'BV' })
    .sort({ voucherNo: -1 })
    .select('voucherNo')
    .lean();
  return (last?.voucherNo || 0) + 1;
}

// Record one dated debit OR credit directly on a bank account. Accepts either
// { direction: 'DR'|'CR', amount } or { debit, credit } — exactly one side > 0.
export async function addEntry(id, data) {
  const bank = await getBank(id);

  if (!data.date || Number.isNaN(new Date(data.date).getTime())) {
    throw ApiError.badRequest('date is required and must be a valid date');
  }

  let debit = Math.abs(Number(data.debit) || 0);
  let credit = Math.abs(Number(data.credit) || 0);
  if (data.direction === 'DR') {
    debit = Math.abs(Number(data.amount) || 0);
    credit = 0;
  } else if (data.direction === 'CR') {
    credit = Math.abs(Number(data.amount) || 0);
    debit = 0;
  }
  if ((debit > 0) === (credit > 0)) {
    throw ApiError.badRequest('Enter exactly one of debit or credit (greater than 0)');
  }

  await LedgerEntry.create({
    partyId: bank._id,
    date: new Date(data.date),
    voucherType: 'BV',
    voucherNo: await nextVoucherNo(bank._id),
    narration: data.narration || '',
    debit,
    credit,
    sourceType: 'BANK',
  });

  return { balance: await getPartyBalance(bank._id, karachiDay(new Date())) };
}
