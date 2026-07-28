import asyncHandler from '../utils/asyncHandler.js';
import * as bankService from '../services/bank.service.js';

// Thin controllers — the bank ledger view itself reuses GET /reports/ledger.

export const list = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { items: await bankService.listBanks() } });
});

export const addEntry = asyncHandler(async (req, res) => {
  const data = await bankService.addEntry(req.params.id, req.body || {});
  res.status(201).json({ success: true, data });
});
