import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import User from '../models/User.js';

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

/**
 * Validate credentials and return a signed token + sanitized user.
 * Uses one generic message for both "unknown email" and "wrong password"
 * so the endpoint does not reveal which emails exist.
 */
export async function login(email, password) {
  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select(
    '+passwordHash'
  );

  const ok = user && user.isActive && (await user.comparePassword(password));
  if (!ok) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  return { token: signToken(user), user: user.toJSON() };
}

/** Change the current user's password after verifying the current one. */
export async function changePassword(userId, currentPassword, newPassword) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.unauthorized();

  const ok = await user.comparePassword(currentPassword);
  if (!ok) throw ApiError.badRequest('Current password is incorrect');

  user.passwordHash = await User.hashPassword(newPassword);
  await user.save();
}
