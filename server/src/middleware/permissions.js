import ApiError from '../utils/ApiError.js';

// Gate an endpoint on the viewProfit permission (e.g. the profit report). Must
// run after requireAuth.
export function requireViewProfit(req, _res, next) {
  if (req.user?.permissions?.viewProfit === true) return next();
  return next(ApiError.forbidden('This resource requires the viewProfit permission'));
}
