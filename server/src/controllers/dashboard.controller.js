import asyncHandler from '../utils/asyncHandler.js';
import { assertValidDate } from '../validators/daybook.validator.js';
import { karachiDay } from '../utils/shopDate.js';
import { getDashboard } from '../services/dashboard.service.js';

export const dashboard = asyncHandler(async (req, res) => {
  const date = req.query.date || karachiDay(new Date());
  assertValidDate(date);
  res.json({ success: true, data: await getDashboard(date) });
});
