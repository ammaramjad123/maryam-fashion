import { Router } from 'express';
import makeCrudController from '../controllers/crudController.js';
import makeCrudRouter from './makeCrudRouter.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import * as partyService from '../services/party.service.js';
import * as productService from '../services/product.service.js';
import * as expenseHeadService from '../services/expenseHead.service.js';
import { recomputeCodeNumbers, seedDayZero } from '../services/golive.service.js';

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

// One-time go-live seed (ADMIN only). Wipes every DAY record (keeps masters +
// party/bank openings + product opening stock), sets the opening cash, and posts
// a "Day Zero" carrying the owner's opening snapshot into the first real day.
// The figures are the owner's fixed go-live numbers; only the Day-Zero date is
// chosen at run time. Cash reconciles exactly: 143,742 + 258,600 − 110,000 −
// 71,639 = 220,703 (Day 1's opening cash).
router.post(
  '/maintenance/seed-day-zero',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const dayZeroDate = String(req.body?.dayZeroDate || '');
    const openingCash = 143742; // Day Zero's own opening cash
    const totals = {
      cashSale: 256700,
      creditSale: 0,
      totalSale: 256700,
      discountOnSale: 0,
      totalSaleLessDisc: 256700,
      cashSaleLessDisc: 258600, // drives the cash chain → Net Cash 220,703
      totalProfit: -265455,
      totalPurchase: 0,
      cashPurchase: 0,
      totalReceipts: 0,
      totalPayments: 110000,
      totalExpenses: 71639,
      totalCash: 402342,
      netCash: 220703,
    };
    const result = await seedDayZero({ dayZeroDate, openingCash, totals });
    res.json({
      success: true,
      data: result,
      message: `Day Zero posted on ${dayZeroDate}. Day 1 opens at ${totals.netCash.toLocaleString('en-US')}. Deleted ${result.deleted.dayBooks} day book(s).`,
    });
  })
);

router.use('/parties', makeCrudRouter(makeCrudController(partyService)));
router.use('/products', makeCrudRouter(makeCrudController(productService)));
router.use('/expense-heads', makeCrudRouter(makeCrudController(expenseHeadService)));

export default router;
