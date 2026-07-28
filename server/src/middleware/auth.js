import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import User from '../models/User.js';

/**
 * Verifies the Bearer token, reloads the user from the DB (so a deactivated
 * user is rejected immediately and permissions are always fresh), and attaches
 * it as `req.user`. Rejects with 401 when the token is missing or invalid.
 */
export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw ApiError.unauthorized('Missing or malformed Authorization header');
    }

    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret);
    } catch {
      throw ApiError.unauthorized('Invalid or expired token');
    }

    const user = await User.findById(payload.sub);
    if (!user || !user.isActive) {
      throw ApiError.unauthorized('User no longer active');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Restricts a route to the given role(s). Must run after requireAuth. */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden(`Requires role: ${roles.join(' or ')}`));
    }
    next();
  };
}
