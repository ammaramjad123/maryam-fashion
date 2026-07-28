import mongoose from 'mongoose';

const { Schema } = mongoose;

// Derived — written by the system when a voucher is posted (and by Party
// opening). Never edited by a user. Running balance is NOT stored; it is
// computed by getPartyBalance (Σdebit − Σcredit).
const ledgerEntrySchema = new Schema(
  {
    date: { type: Date, required: true },
    partyId: { type: Schema.Types.ObjectId, ref: 'Party', required: true },
    voucherType: {
      // BV = Bank Voucher: a debit/credit entered directly on a bank account
      // (docs/07 R9.3), never through the Day Book.
      type: String,
      enum: ['OP', 'DV', 'CV', 'JV', 'SALE', 'PURCHASE', 'BV'],
      required: true,
    },
    voucherNo: { type: Number, default: 0 },
    narration: { type: String, default: '' },
    debit: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
    sourceType: { type: String, enum: ['DAYBOOK', 'OPENING', 'JOURNAL', 'BANK'], required: true },
    sourceId: { type: Schema.Types.ObjectId },
  },
  { timestamps: true }
);

ledgerEntrySchema.index({ partyId: 1, date: 1 });
ledgerEntrySchema.index({ sourceId: 1 });

export default mongoose.model('LedgerEntry', ledgerEntrySchema);
