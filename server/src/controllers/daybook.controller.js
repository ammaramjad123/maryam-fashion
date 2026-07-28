import asyncHandler from '../utils/asyncHandler.js';
import * as daybookService from '../services/daybook.service.js';
import {
  assertValidDate,
  assertNotFuture,
  validateSections,
} from '../validators/daybook.validator.js';

// Thin controllers: validate at the boundary, then delegate to the service.

export const getDay = asyncHandler(async (req, res) => {
  assertValidDate(req.params.date);
  const data = await daybookService.getDay(req.params.date);
  res.json({ success: true, data });
});

export const saveDraft = asyncHandler(async (req, res) => {
  assertValidDate(req.params.date);
  validateSections(req.body || {});
  const data = await daybookService.saveDraft(req.params.date, req.body || {});
  res.json({ success: true, data });
});

export const post = asyncHandler(async (req, res) => {
  assertValidDate(req.params.date);
  assertNotFuture(req.params.date);
  const day = await daybookService.postByDate(req.params.date);
  res.json({ success: true, data: { day } });
});

export const unpost = asyncHandler(async (req, res) => {
  assertValidDate(req.params.date);
  const day = await daybookService.unpostByDate(req.params.date);
  res.json({ success: true, data: { day } });
});

export const list = asyncHandler(async (req, res) => {
  const data = await daybookService.listDays(req.query);
  res.json({ success: true, data });
});
