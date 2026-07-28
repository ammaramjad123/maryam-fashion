import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import * as controller from '../controllers/stock.controller.js';

const router = Router();

router.get('/stock/current', requireAuth, controller.current);
// Adjustment is an ADMIN-only voucher with a mandatory reason.
router.post('/stock/adjustment', requireAuth, requireRole('ADMIN'), controller.adjust);

export default router;
