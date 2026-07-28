import mongoose from 'mongoose';

const { Schema } = mongoose;

// Derived — one row per goods line when a DayBook is posted. `qty` is the SIGNED
// line quantity (a return is negative). getStock applies the sign per type:
// closing = openingStock + Σpurchase − Σsale.
const stockTransactionSchema = new Schema(
  {
    date: { type: Date, required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    type: { type: String, enum: ['OPENING', 'PURCHASE', 'SALE', 'ADJUSTMENT'], required: true },
    qty: { type: Number, required: true },
    rate: { type: Number, default: 0 },
    sourceType: { type: String, enum: ['DAYBOOK', 'ADJUSTMENT', 'OPENING'], required: true },
    sourceId: { type: Schema.Types.ObjectId },
    narration: { type: String, default: '' },
  },
  { timestamps: true }
);

stockTransactionSchema.index({ productId: 1, date: 1 });
stockTransactionSchema.index({ sourceId: 1 });

export default mongoose.model('StockTransaction', stockTransactionSchema);
