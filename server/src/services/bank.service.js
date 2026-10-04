import mongoose from 'mongoose';
import Party from '../models/Party.js';
import LedgerEntry from '../models/LedgerEntry.js';
import ApiError from '../utils/ApiError.js';
import { getPartyBalance, getPartyBalances } from './ledger.service.js';
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
  const balances = await getPartyBalances(today); // one aggregation for all banks
  const zero = { signedBalance: 0, side: 'NONE', amount: 0 };
  return banks.map((b) => ({ ...b, balance: balances.get(String(b._id)) || zero }));
}

// A running-balance descriptor from a signed amount (matches the ledger report).
function sideOf(signed) {
  return {
    signedBalance: signed,
    side: signed > 0 ? 'DR' : signed < 0 ? 'CR' : 'NONE',
    amount: Math.abs(signed),
  };
}

// All entries of one bank, oldest first, each with its _id and a running balance.
// This is what the Banks screen lists so each row can be edited or deleted.
export async function listEntries(id) {
  const bank = await getBank(id);
  const entries = await LedgerEntry.find({ partyId: bank._id })
    .sort({ date: 1, createdAt: 1, _id: 1 })
    .lean();
  let running = 0;
  const rows = entries.map((e) => {
    running += (e.debit || 0) - (e.credit || 0);
    return {
      _id: String(e._id),
      date: karachiDay(e.date),
      narration: e.narration || '',
      voucherType: e.voucherType,
      debit: e.debit || 0,
      credit: e.credit || 0,
      balance: sideOf(running),
    };
  });
  return { bank: { _id: String(bank._id), name: bank.name }, rows, balance: sideOf(running) };
}

// Normalise an edit/add payload to exactly one of debit/credit. Accepts either
// { direction:'DR'|'CR', amount } or { debit, credit }. Returns { debit, credit }.
function normalizeSides(data, fallback = { debit: 0, credit: 0 }) {
  let debit = fallback.debit || 0;
  let credit = fallback.credit || 0;
  if (data.direction === 'DR') {
    debit = Math.abs(Number(data.amount) || 0);
    credit = 0;
  } else if (data.direction === 'CR') {
    credit = Math.abs(Number(data.amount) || 0);
    debit = 0;
  } else if (data.debit !== undefined || data.credit !== undefined) {
    debit = Math.abs(Number(data.debit) || 0);
    credit = Math.abs(Number(data.credit) || 0);
  }
  if ((debit > 0) === (credit > 0)) {
    throw ApiError.badRequest('Enter exactly one of debit or credit (greater than 0)');
  }
  return { debit, credit };
}

// Edit one existing entry (any entry on the bank — a manual BV or the opening).
export async function updateEntry(id, entryId, data) {
  const bank = await getBank(id);
  if (!mongoose.isValidObjectId(entryId)) throw ApiError.notFound('Entry not found');
  const entry = await LedgerEntry.findOne({ _id: entryId, partyId: bank._id });
  if (!entry) throw ApiError.notFound('Entry not found');

  if (data.date !== undefined) {
    if (!data.date || Number.isNaN(new Date(data.date).getTime())) {
      throw ApiError.badRequest('date must be a valid date');
    }
    entry.date = new Date(data.date);
  }
  if (data.narration !== undefined) entry.narration = data.narration || '';
  const { debit, credit } = normalizeSides(data, { debit: entry.debit, credit: entry.credit });
  entry.debit = debit;
  entry.credit = credit;
  await entry.save();

  return { balance: await getPartyBalance(bank._id, karachiDay(new Date())) };
}

// Delete one entry from a bank. Balance re-derives from what remains.
export async function deleteEntry(id, entryId) {
  const bank = await getBank(id);
  if (!mongoose.isValidObjectId(entryId)) throw ApiError.notFound('Entry not found');
  const res = await LedgerEntry.deleteOne({ _id: entryId, partyId: bank._id });
  if (res.deletedCount === 0) throw ApiError.notFound('Entry not found');
  return { balance: await getPartyBalance(bank._id, karachiDay(new Date())) };
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
