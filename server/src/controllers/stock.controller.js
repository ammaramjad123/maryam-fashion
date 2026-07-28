import asyncHandler from '../utils/asyncHandler.js';
import { karachiDay } from '../utils/shopDate.js';
import { assertValidDate } from '../validators/daybook.validator.js';
import { getCurrentStock, adjustStock } from '../services/stockAdjust.service.js';

export const current = asyncHandler(async (req, res) => {
  const date = req.query.date || karachiDay(new Date());
  assertValidDate(date);
  res.json({ success: true, data: { items: await getCurrentStock(date) } });
});

export const adjust = asyncHandler(async (req, res) => {
  const result = await adjustStock(req.body || {}, req.user);
  res.status(201).json({ success: true, data: result, message: 'Stock adjusted' });
});
