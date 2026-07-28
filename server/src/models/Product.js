import mongoose from 'mongoose';
import { parseCodeNumber } from '../utils/productCode.js';

// currentStock is NOT stored — it is derived from StockTransaction (Phase 4+).
// costRate is NOT stored either — a product is a PRICE BUCKET, and its cost is
// ALWAYS derived from the code number (docs/07 R6): codeRate = codeNumber ×
// Setting.codeMultiplier. See services/profit.js#costRateForProduct.
const productSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, trim: true, default: '' },
    saleRate: { type: Number, default: 0, min: 0 },
    // The numeric part of the code (the price bucket). Derived from `code`, kept
    // denormalised so cost math and sorting don't re-parse the string each time.
    codeNumber: { type: Number, default: 0, min: 0 },
    openingStock: { type: Number, default: 0 },
    openingDate: { type: Date },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// codeNumber always follows the code — never set by hand.
productSchema.pre('save', function syncCodeNumber(next) {
  if (this.isModified('code')) this.codeNumber = parseCodeNumber(this.code);
  next();
});

productSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

const Product = mongoose.model('Product', productSchema);

export default Product;
