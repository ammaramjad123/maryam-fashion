import { Router } from 'express';
import makeCrudController from '../controllers/crudController.js';
import makeCrudRouter from './makeCrudRouter.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import * as partyService from '../services/party.service.js';
import * as productService from '../services/product.service.js';
import * as expenseHeadService from '../services/expenseHead.service.js';
import {
  recomputeCodeNumbers,
  restoreAug31Draft,
  updateDayZeroFigures,
} from '../services/golive.service.js';

const router = Router();

// Admin maintenance: re-derive every product's stored codeNumber from its code
// (docs/07 R6). Fixes point-value codes (e.g. K24.50) saved before the parser
// kept the decimal point. Registered before the /products CRUD mount so it is
// not captured as an id. Idempotent.
router.post(
  '/products/recompute-codes',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (_req, res) => {
    const result = await recomputeCodeNumbers();
    res.json({
      success: true,
      data: result,
      message: `Rechecked ${result.scanned} product(s); corrected ${result.changed}.`,
    });
  })
);

// One-off (ADMIN only): restore the 31 Aug 2026 day book that was lost to the
// save error, re-entered from the operator's screenshots as a DRAFT. Does NOT
// post — the cousin reviews and posts himself.
router.post(
  '/maintenance/restore-aug31',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (_req, res) => {
    const result = await restoreAug31Draft();
    res.json({
      success: true,
      data: result,
      message: `Saved DRAFT for ${result.date}: ${result.saved.sales} sales, ${result.saved.purchases} purchases, ${result.saved.payments} payments. Review and post it yourself.`,
    });
  })
);

// One-off (ADMIN only): re-apply the Day-Zero display figures (e.g. Total Profit)
// to the seeded Day-Zero report. Display-only — does not touch cash.
router.post(
  '/maintenance/update-dayzero',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (_req, res) => {
    const result = await updateDayZeroFigures();
    res.json({
      success: true,
      data: result,
      message: `Day Zero updated — Total Profit is now ${result.totalProfit.toLocaleString('en-US')}.`,
    });
  })
);

router.use('/parties', makeCrudRouter(makeCrudController(partyService)));
router.use('/products', makeCrudRouter(makeCrudController(productService)));
router.use('/expense-heads', makeCrudRouter(makeCrudController(expenseHeadService)));

export default router;
