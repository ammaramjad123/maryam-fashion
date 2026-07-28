import mongoose from 'mongoose';
import Party from '../models/Party.js';
import LedgerEntry from '../models/LedgerEntry.js';
import ApiError from '../utils/ApiError.js';
import { getPagination, paginated, escapeRegex } from '../utils/pagination.js';

const TYPES = ['CUSTOMER', 'SUPPLIER', 'EMPLOYEE', 'OTHER', 'BANK'];

// Parties are identified by NAME in the UI. An accountCode is still kept
// internally (the printed ledger header shows it), but it is AUTO-GENERATED —
// never asked for. Chart-of-accounts style prefix by type, then a running seq.
const CODE_PREFIX = { CUSTOMER: '11', SUPPLIER: '31', EMPLOYEE: '22', BANK: '41', OTHER: '51' };
async function nextAccountCode(type) {
  const prefix = CODE_PREFIX[type] || '51';
  const last = await Party.findOne({ accountCode: new RegExp(`^${prefix}`) })
    .sort({ accountCode: -1 })
    .select('accountCode')
    .lean();
  const seq = last ? Number(last.accountCode.slice(prefix.length)) + 1 : 1001;
  return `${prefix}${String(seq).padStart(5, '0')}`; // e.g. 1101001
}

// A non-zero opening balance MUST carry an explicit openingDate: the OP row is
// dated by it, and a missing date would silently land the opening on today and
// skew every as-of-earlier balance. Callers validate before writing.
function assertOpeningDate(openingBalance, openingDate) {
  if (!openingBalance) return; // a zero opening writes no OP row — no date needed
  if (!openingDate) {
    throw ApiError.badRequest('openingDate is required when an opening balance is given');
  }
  if (Number.isNaN(new Date(openingDate).getTime())) {
    throw ApiError.badRequest('openingDate must be a valid date');
  }
}

// The opening balance is represented as a real OP LedgerEntry (voucherNo 0),
// so getPartyBalance is a pure Σ over entries with no opening special-case.
// openingDate is guaranteed present here (assertOpeningDate ran first).
async function writeOpeningEntry(party) {
  if (!party.openingBalance) return;
  await LedgerEntry.create({
    partyId: party._id,
    date: party.openingDate,
    voucherType: 'OP',
    voucherNo: 0,
    narration: 'Opening balance',
    debit: party.openingType === 'DR' ? party.openingBalance : 0,
    credit: party.openingType === 'CR' ? party.openingBalance : 0,
    sourceType: 'OPENING',
    sourceId: party._id,
  });
}

// Any entry that isn't the OP row means the party has posted transactions.
async function hasPostedEntries(partyId) {
  return LedgerEntry.exists({ partyId, sourceType: { $ne: 'OPENING' } });
}

// Build the isActive filter from ?status=active|inactive|all (default active).
function statusFilter(status) {
  if (status === 'all') return {};
  if (status === 'inactive') return { isActive: false };
  return { isActive: true };
}

export async function list(query) {
  const { page, limit, skip } = getPagination(query);
  const filter = { ...statusFilter(query.status) };

  // Banks are managed on their own screen (docs/07 R9.3) — keep them OUT of the
  // general Parties list unless a bank is explicitly requested (?type=BANK).
  if (query.type && TYPES.includes(query.type)) filter.type = query.type;
  else filter.type = { $ne: 'BANK' };

  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search.trim()), 'i');
    filter.$or = [{ name: rx }, { accountCode: rx }, { phone: rx }];
  }

  const [items, total] = await Promise.all([
    Party.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
    Party.countDocuments(filter),
  ]);

  return paginated(items, total, page, limit);
}

// Lightweight type-ahead for the Day Book (active parties only, minimal fields).
export async function search(query) {
  const q = (query.q || '').trim();
  const limit = Math.min(20, Math.max(1, parseInt(query.limit, 10) || 10));
  const filter = { isActive: true };
  // Exclude banks from the party type-ahead too (so a bank can't be picked as a
  // customer/supplier on a Day Book line); banks have their own screen.
  if (query.type && TYPES.includes(query.type)) filter.type = query.type;
  else filter.type = { $ne: 'BANK' };
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { accountCode: rx }];
  }
  return Party.find(filter).select('accountCode name type').sort({ name: 1 }).limit(limit);
}

export async function getById(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Party not found');
  const party = await Party.findById(id);
  if (!party) throw ApiError.notFound('Party not found');
  return party;
}

export async function create(data) {
  if (!data.name || !data.name.trim()) throw ApiError.badRequest('name is required');
  if (!TYPES.includes(data.type))
    throw ApiError.badRequest(`type must be one of ${TYPES.join(', ')}`);

  // A BANK opens with a plain positive amount (a running asset balance) — no Dr/Cr
  // is asked for; it's always Debit-side. Customers/suppliers/employees keep their
  // meaningful Dr/Cr direction.
  const openingType = data.type === 'BANK' ? 'DR' : data.openingType;
  if (!['DR', 'CR'].includes(openingType)) {
    throw ApiError.badRequest("openingType is required and must be 'DR' or 'CR'");
  }

  const openingBalance = Math.abs(Number(data.openingBalance) || 0);
  assertOpeningDate(openingBalance, data.openingDate);

  // accountCode is AUTO-GENERATED (never asked for). Honour an explicit one only
  // if a caller (e.g. a seed) passes it; otherwise mint the next for this type.
  const accountCode = (data.accountCode || '').trim() || (await nextAccountCode(data.type));
  const exists = await Party.findOne({ accountCode });
  if (exists) throw ApiError.conflict(`A party with accountCode ${accountCode} already exists`);

  const party = await Party.create({
    accountCode,
    name: data.name.trim(),
    type: data.type,
    phone: data.phone,
    address: data.address,
    openingBalance,
    openingType,
    openingDate: data.openingDate || undefined,
  });

  await writeOpeningEntry(party);
  return party;
}

export async function update(id, data) {
  const party = await getById(id);

  // Detect an opening-balance edit (amount or side changing).
  const nextOpeningBalance =
    data.openingBalance !== undefined
      ? Math.abs(Number(data.openingBalance) || 0)
      : party.openingBalance;
  const nextOpeningType = data.openingType !== undefined ? data.openingType : party.openingType;
  const nextOpeningDate =
    data.openingDate !== undefined ? data.openingDate : party.openingDate;
  const openingEdited =
    nextOpeningBalance !== party.openingBalance ||
    nextOpeningType !== party.openingType ||
    data.openingDate !== undefined;

  // A rewritten OP row must still carry an explicit date (never default to today).
  if (openingEdited) assertOpeningDate(nextOpeningBalance, nextOpeningDate);

  // Opening is frozen once the party has any posted transaction (docs decision).
  if (openingEdited && (await hasPostedEntries(party._id))) {
    throw ApiError.conflict(
      'Opening balance is frozen: this party already has posted transactions'
    );
  }

  if (data.accountCode !== undefined) {
    const accountCode = String(data.accountCode).trim();
    if (!accountCode) throw ApiError.badRequest('accountCode cannot be empty');
    if (accountCode !== party.accountCode) {
      const clash = await Party.findOne({ accountCode, _id: { $ne: party._id } });
      if (clash) throw ApiError.conflict(`A party with accountCode ${accountCode} already exists`);
      party.accountCode = accountCode;
    }
  }
  if (data.name !== undefined) party.name = String(data.name).trim();
  if (data.type !== undefined) {
    if (!TYPES.includes(data.type))
      throw ApiError.badRequest(`type must be one of ${TYPES.join(', ')}`);
    party.type = data.type;
  }
  if (data.openingType !== undefined) {
    if (!['DR', 'CR'].includes(data.openingType)) {
      throw ApiError.badRequest("openingType must be 'DR' or 'CR'");
    }
    party.openingType = data.openingType;
  }
  if (data.phone !== undefined) party.phone = data.phone;
  if (data.address !== undefined) party.address = data.address;
  if (data.openingBalance !== undefined)
    party.openingBalance = Math.abs(Number(data.openingBalance) || 0);
  if (data.openingDate !== undefined) party.openingDate = data.openingDate || undefined;
  if (data.isActive !== undefined) party.isActive = Boolean(data.isActive);

  await party.save();

  // Reverse & rewrite the OP entry so the ledger stays in sync with the master.
  if (openingEdited) {
    await LedgerEntry.deleteMany({ partyId: party._id, sourceType: 'OPENING' });
    await writeOpeningEntry(party);
  }

  return party;
}

// Soft delete — never hard-remove a master (audit trail).
export async function deactivate(id) {
  const party = await getById(id);
  party.isActive = false;
  await party.save();
  return party;
}
