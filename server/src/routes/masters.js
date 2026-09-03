import { Router } from 'express';
import makeCrudController from '../controllers/crudController.js';
import makeCrudRouter from './makeCrudRouter.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import * as partyService from '../services/party.service.js';
import * as productService from '../services/product.service.js';
import * as expenseHeadService from '../services/expenseHead.service.js';
import { recomputeCodeNumbers } from '../services/golive.service.js';

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

router.use('/parties', makeCrudRouter(makeCrudController(partyService)));
router.use('/products', makeCrudRouter(makeCrudController(productService)));
router.use('/expense-heads', makeCrudRouter(makeCrudController(expenseHeadService)));

export default router;
