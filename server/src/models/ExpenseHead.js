import mongoose from 'mongoose';

// Small master list: Rent, Electricity, Tea, Water, Hall Rent, Salary, Misc...
const expenseHeadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

expenseHeadSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

const ExpenseHead = mongoose.model('ExpenseHead', expenseHeadSchema);

export default ExpenseHead;
