import asyncHandler from '../utils/asyncHandler.js';
import * as bankService from '../services/bank.service.js';

// Thin controllers — the bank ledger view itself reuses GET /reports/ledger.

export const list = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { items: await bankService.listBanks() } });
});

export const listEntries = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await bankService.listEntries(req.params.id) });
});

export const addEntry = asyncHandler(async (req, res) => {
  const data = await bankService.addEntry(req.params.id, req.body || {});
  res.status(201).json({ success: true, data });
});

export const updateEntry = asyncHandler(async (req, res) => {
  const data = await bankService.updateEntry(req.params.id, req.params.entryId, req.body || {});
  res.json({ success: true, data });
});

export const deleteEntry = asyncHandler(async (req, res) => {
  const data = await bankService.deleteEntry(req.params.id, req.params.entryId);
  res.json({ success: true, data });
});
