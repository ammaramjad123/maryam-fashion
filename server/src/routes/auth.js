import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as authController from '../controllers/auth.controller.js';

const router = Router();

router.post('/auth/login', authController.login);
router.get('/auth/me', requireAuth, authController.me);
router.post('/auth/change-password', requireAuth, authController.changePassword);

export default router;
