import { Router } from 'express';
import profitFilter from '../middleware/profitFilter.js';
import healthRoutes from './health.js';
import authRoutes from './auth.js';
import reportRoutes from './reports.js';
import masterRoutes from './masters.js';
import daybookRoutes from './daybook.js';
import dashboardRoutes from './dashboard.js';
import stockRoutes from './stock.js';
import bankRoutes from './banks.js';

// Aggregates all /api/v1 routes. Feature routers get mounted here in later phases.
const router = Router();

// Strip profit/cost from EVERY response for users without viewProfit (wraps
// res.json; reads req.user when the response is sent). This is the one place.
router.use(profitFilter);

router.use(healthRoutes);
router.use(authRoutes);
// Reports before masters so GET /parties/outstanding wins over GET /parties/:id.
router.use(reportRoutes);
router.use(masterRoutes);
router.use(daybookRoutes);
router.use(dashboardRoutes);
router.use(stockRoutes);
router.use(bankRoutes);

export default router;
