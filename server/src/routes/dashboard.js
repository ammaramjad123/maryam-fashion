import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { dashboard } from '../controllers/dashboard.controller.js';

const router = Router();

router.get('/dashboard', requireAuth, dashboard);

export default router;
