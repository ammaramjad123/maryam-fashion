import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';

/**
 * Standard master routes. Reads require any authenticated user; writes are
 * ADMIN-only. `/search` is registered before `/:id` so it isn't captured as an id.
 */
export default function makeCrudRouter(controller) {
  const router = Router();

  router.use(requireAuth);

  router.get('/', controller.list);
  if (controller.search) router.get('/search', controller.search);
  router.get('/:id', controller.getById);

  router.post('/', requireRole('ADMIN'), controller.create);
  router.patch('/:id', requireRole('ADMIN'), controller.update);
  router.delete('/:id', requireRole('ADMIN'), controller.deactivate);

  return router;
}
