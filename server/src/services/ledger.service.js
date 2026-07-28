import mongoose from 'mongoose';
import LedgerEntry from '../models/LedgerEntry.js';
import { nextDayStart } from '../utils/shopDate.js';

const { Types } = mongoose;

/**
 * Party balance as of the WHOLE shop-local day `uptoDate` ('YYYY-MM-DD').
 * Pure Σ over entries (the opening is itself an OP entry): there is no special
 * opening case.
 *
 *   signedBalance = Σdebit − Σcredit    (> 0 ⇒ Dr, < 0 ⇒ Cr, 0 ⇒ none)
 */
export async function getPartyBalance(partyId, uptoDate) {
  const upper = nextDayStart(uptoDate);
  const [row] = await LedgerEntry.aggregate([
    { $match: { partyId: new Types.ObjectId(String(partyId)), date: { $lt: upper } } },
    { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
  ]);

  const signedBalance = (row?.debit || 0) - (row?.credit || 0);
  const side = signedBalance > 0 ? 'DR' : signedBalance < 0 ? 'CR' : 'NONE';
  return { signedBalance, side, amount: Math.abs(signedBalance) };
}

/**
 * Balances for EVERY party as of `uptoDate`, computed in ONE aggregation grouped
 * by partyId — the batch form of getPartyBalance, to avoid an N+1 (one round-trip
 * per party) when a caller needs many balances (dashboard, Outstanding).
 * Returns a Map: partyId(string) → { signedBalance, side, amount }. A party with
 * no ledger entries is simply absent from the Map (its balance is 0 / NONE).
 */
export async function getPartyBalances(uptoDate) {
  const upper = nextDayStart(uptoDate);
  const rows = await LedgerEntry.aggregate([
    { $match: { date: { $lt: upper } } },
    { $group: { _id: '$partyId', debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
  ]);
  const map = new Map();
  for (const r of rows) {
    const signedBalance = (r.debit || 0) - (r.credit || 0);
    const side = signedBalance > 0 ? 'DR' : signedBalance < 0 ? 'CR' : 'NONE';
    map.set(String(r._id), { signedBalance, side, amount: Math.abs(signedBalance) });
  }
  return map;
}
