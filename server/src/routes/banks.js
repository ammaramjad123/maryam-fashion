import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as controller from '../controllers/bank.controller.js';

// Bank accounts (docs/07 R9.3). Creation/CRUD reuse the parties master
// (type BANK); this router adds the bank list + direct dated entries.
const router = Router();

router.use(requireAuth);
router.get('/banks', controller.list);
router.post('/banks/:id/entries', controller.addEntry);

export default router;
