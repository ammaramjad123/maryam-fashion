import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import * as controller from '../controllers/daybook.controller.js';

const router = Router();

router.use(requireAuth);

// List must be registered before the ':date' routes.
router.get('/daybook', controller.list);
router.get('/daybook/:date', controller.getDay);
router.put('/daybook/:date', controller.saveDraft);
router.post('/daybook/:date/post', controller.post);
router.post('/daybook/:date/unpost', requireRole('ADMIN'), controller.unpost);

export default router;
