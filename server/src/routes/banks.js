import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as controller from '../controllers/bank.controller.js';

// Bank accounts (docs/07 R9.3). Creation/CRUD reuse the parties master
// (type BANK); this router adds the bank list + direct dated entries.
const router = Router();

router.use(requireAuth);
router.get('/banks', controller.list);
router.get('/banks/:id/entries', controller.listEntries);
router.post('/banks/:id/entries', controller.addEntry);
router.patch('/banks/:id/entries/:entryId', controller.updateEntry);
router.delete('/banks/:id/entries/:entryId', controller.deleteEntry);

export default router;
