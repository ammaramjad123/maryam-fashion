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
    const openingCash = 143742; // Day Zero's own opening cash (top-right + col 3)
    // Base totals: drive the cash chain (→ Net Cash 220,703) and fill the report
    // slots the app already derives.
    const totals = {
      creditSale: 0,
      cashSale: 256700,
      totalSale: 256700,
      discountOnSale: 0,
      totalSaleLessDisc: 0, // owner's figure
      cashSaleLessDisc: 258600, // drives the cash chain
      totalProfit: -265455, // "Total Profit"
      totalPurchase: 0,
      cashPurchase: 0,
      totalReceipts: 0, // Cash Rec
      totalPayments: 110000, // Paid Cash
      totalExpenses: 71639, // "Shop Exp" (today)
      totalCash: 402342,
      netCash: 220703,
    };
    // Display-only figures the per-day model doesn't derive — printed verbatim on
    // Day Zero's Daily Sale report (top band + the running "Total" slots).
    const reportOverride = {
      totals: {
        profitSalePur: 27500, // "Profit Sale/Pur" (today) — distinct from Total Profit
        totalSaleBank: 515300, // "Total Sale Bank" (running)
        totalExp: 378349, // "Total Exp" (running)
      },
      previousDay: {
        totalProfit: -292955, // top band "Profit"
        cashSale: 256700, // top band "Cash Sale"
        totalExpenses: 306710, // top band "Shop Exp"
      },
    };
    const result = await seedDayZero({ dayZeroDate, openingCash, totals, reportOverride });
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
