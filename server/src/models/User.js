import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 10;

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // `select: false` keeps the hash out of every query result by default;
    // it must be explicitly requested with .select('+passwordHash') to compare.
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['ADMIN', 'OPERATOR'], required: true },
    permissions: {
      viewProfit: { type: Boolean, default: false },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Defense in depth: even if passwordHash is ever selected, never serialize it.
userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

userSchema.statics.hashPassword = function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
};

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

const User = mongoose.model('User', userSchema);

export default User;
