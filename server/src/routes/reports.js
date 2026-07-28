import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireViewProfit } from '../middleware/permissions.js';
import * as controller from '../controllers/report.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/reports/daily-sale', controller.dailySale);
router.get('/reports/daily-stock', controller.dailyStock);
router.get('/reports/ledger', controller.ledger);
router.get('/reports/cashbook', controller.cashbook);
router.get('/reports/position', controller.position);
// Profit report is only for users who may view profit.
router.get('/reports/profit', requireViewProfit, controller.profit);

// PDF variants (same auth) — render the matching /print page via headless Chrome.
router.get('/reports/daily-sale.pdf', controller.dailySalePdf);
router.get('/reports/daily-stock.pdf', controller.dailyStockPdf);
router.get('/reports/ledger.pdf', controller.ledgerPdf);
router.get('/reports/cashbook.pdf', controller.cashbookPdf);
router.get('/reports/outstanding.pdf', controller.outstandingPdf);
router.get('/reports/position.pdf', controller.positionPdf);

// XLSX variants (same auth, same data source) — a formatted workbook per report.
router.get('/reports/daily-sale.xlsx', controller.dailySaleXlsx);
router.get('/reports/daily-stock.xlsx', controller.dailyStockXlsx);
router.get('/reports/ledger.xlsx', controller.ledgerXlsx);
router.get('/reports/cashbook.xlsx', controller.cashbookXlsx);
router.get('/reports/outstanding.xlsx', controller.outstandingXlsx);
router.get('/reports/position.xlsx', controller.positionXlsx);

// Outstanding lives under /parties per docs/05; this router is mounted BEFORE the
// masters router so it matches ahead of the generic GET /parties/:id.
router.get('/parties/outstanding', controller.outstanding);

export default router;
