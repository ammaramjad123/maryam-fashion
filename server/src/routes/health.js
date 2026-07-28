import { Router } from 'express';
import { dbState } from '../config/db.js';

const router = Router();

// GET /api/v1/health — liveness probe. Answers 200 regardless of DB state.
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      db: dbState(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;
