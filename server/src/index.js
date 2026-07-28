import { createApp } from './app.js';
import env from './config/env.js';
import { connectDb } from './config/db.js';
import { closeBrowser } from './services/pdf.service.js';

async function start() {
  // Kick off the DB connection but don't block server startup on it.
  connectDb();

  const app = createApp();

  const server = app.listen(env.port, () => {
    console.log(`[server] listening on http://localhost:${env.port}`);
    console.log(`[server] health:   http://localhost:${env.port}${env.apiPrefix}/health`);
  });

  const shutdown = async (signal) => {
    console.log(`\n[server] ${signal} received, shutting down...`);
    await closeBrowser().catch(() => {});
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
