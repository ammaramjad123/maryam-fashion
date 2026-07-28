import mongoose from 'mongoose';

// One collection for every account: customers, suppliers, employees, others.
// Balances are NOT stored here — they are derived from LedgerEntry (Phase 4+).
const partySchema = new mongoose.Schema(
  {
    accountCode: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    type: {
      // BANK accounts are parties too (docs/07 R9.3) — same ledger, but entered
      // directly and independent of the Day Book / shop cash.
      type: String,
      enum: ['CUSTOMER', 'SUPPLIER', 'EMPLOYEE', 'OTHER', 'BANK'],
      required: true,
    },
    phone: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    openingBalance: { type: Number, default: 0, min: 0 }, // always positive; sign comes from openingType
    openingType: { type: String, enum: ['DR', 'CR'], required: true },
    openingDate: { type: Date },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Hot path: listing/searching parties by type (e.g. all BANK accounts, docs/07 R9.3).
partySchema.index({ type: 1 });

partySchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

const Party = mongoose.model('Party', partySchema);

export default Party;
