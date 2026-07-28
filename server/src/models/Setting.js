import mongoose from 'mongoose';

// Single-document collection. The two unproven business rules live here as
// switches, not hard-coded logic (see docs/07 R8, R9).
const settingSchema = new mongoose.Schema(
  {
    openingCash: { type: Number, default: 0 },
    shopName: { type: String, default: '' },
    currency: { type: String, default: 'PKR' },
    // ⭐ The product code IS the cost: costRate = codeNumber × codeMultiplier
    // (docs/07 R6). The multiplier lives here — never hard-coded anywhere else.
    codeMultiplier: { type: Number, default: 50 },
    // Owner-confirmed default (docs/07 R8): purchase P = (costRate − rate) × qty.
    purchaseProfitFormula: {
      type: String,
      enum: ['ZERO', 'COST_MINUS_RATE'],
      default: 'COST_MINUS_RATE',
    },
    discountAppliesTo: { type: String, enum: ['CASH', 'TOTAL'], default: 'CASH' },
    allowNegativeStock: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('Setting', settingSchema);
