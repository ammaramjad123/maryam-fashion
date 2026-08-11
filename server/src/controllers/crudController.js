import asyncHandler from '../utils/asyncHandler.js';

/**
 * Builds standard CRUD handlers from a service module. Every master (Party,
 * Product, ExpenseHead) exposes the same service shape, so the HTTP layer is
 * identical — only the service differs.
 *
 * Response shapes:
 *   list       -> { success, data: { items, total, page, limit, totalPages } }
 *   search     -> { success, data: { items } }
 *   getById    -> { success, data: { item } }
 *   create     -> 201 { success, data: { item } }
 *   update     -> { success, data: { item } }
 *   deactivate -> { success, data: { item }, message }
 */
export default function makeCrudController(service) {
  const controller = {
    list: asyncHandler(async (req, res) => {
      const data = await service.list(req.query);
      res.json({ success: true, data });
    }),

    getById: asyncHandler(async (req, res) => {
      const item = await service.getById(req.params.id);
      res.json({ success: true, data: { item } });
    }),

    create: asyncHandler(async (req, res) => {
      // The 3rd arg carries request context (e.g. req.user); services that don't
      // need it simply ignore it.
      const item = await service.create(req.body || {}, { user: req.user });
      res.status(201).json({ success: true, data: { item } });
    }),

    update: asyncHandler(async (req, res) => {
      const item = await service.update(req.params.id, req.body || {}, { user: req.user });
      res.json({ success: true, data: { item } });
    }),

    deactivate: asyncHandler(async (req, res) => {
      // ?hard=true PHYSICALLY removes the record — only where the service opts in
      // with a `remove` (currently just Product). Everything else soft-deletes.
      if (req.query.hard === 'true' && service.remove) {
        const removed = await service.remove(req.params.id);
        return res.json({ success: true, data: { item: removed }, message: 'Deleted' });
      }
      const item = await service.deactivate(req.params.id);
      res.json({ success: true, data: { item }, message: 'Deactivated' });
    }),
  };

  // Optional type-ahead endpoint (Party, Product).
  if (service.search) {
    controller.search = asyncHandler(async (req, res) => {
      const items = await service.search(req.query);
      res.json({ success: true, data: { items } });
    });
  }

  return controller;
}
