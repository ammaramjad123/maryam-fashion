import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import * as authService from '../services/auth.service.js';

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    throw ApiError.badRequest('Email and password are required');
  }

  const { token, user } = await authService.login(email, password);
  res.json({ success: true, data: { token, user } });
});

export const me = asyncHandler(async (req, res) => {
  // req.user is a Mongoose doc; toJSON strips passwordHash.
  res.json({ success: true, data: { user: req.user.toJSON() } });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    throw ApiError.badRequest('currentPassword and newPassword are required');
  }
  if (String(newPassword).length < 8) {
    throw ApiError.badRequest('New password must be at least 8 characters');
  }

  await authService.changePassword(req.user._id, currentPassword, newPassword);
  res.json({ success: true, message: 'Password changed' });
});
