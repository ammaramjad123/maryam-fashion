import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import env from './config/env.js';
import requestLogger from './middleware/requestLogger.js';
import notFound from './middleware/notFound.js';
import errorHandler from './middleware/errorHandler.js';
import apiRoutes from './routes/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

// Builds and configures the Express app (no server listening here).
export function createApp() {
  const app = express();

  // Behind Render/Vercel's TLS proxy: trust X-Forwarded-* so req.protocol is
  // 'https'. The PDF renderer derives its base URL from the request, so this
  // must be right or headless Chrome would try to load the /print page over http.
  app.set('trust proxy', true);

  // Security headers. The JWT lives in localStorage (see docs/08 Q8 decision in
  // DEPLOY.md), so the main risk is XSS — a Content-Security-Policy is the real
  // mitigation. This app is fully self-contained and same-origin: scripts are
  // our own bundle ('self'), styles include runtime <style> injection (PageSize)
  // so need 'unsafe-inline', fonts/images are self-hosted or data: URIs, and
  // nothing loads from a third-party origin. Clickjacking is blocked by
  // frame-ancestors 'none'.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'", 'data:'],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false, // not needed; avoids blocking self-hosted assets
    })
  );

  // CORS: allow the deployed client origin(s). CLIENT_ORIGIN may be a single URL
  // or a comma-separated list (e.g. a Vercel production URL + a custom domain).
  // Requests with no Origin (server-to-server, the same-origin PDF renderer,
  // curl) are always allowed; a browser Origin must be on the allowlist.
  const allowedOrigins = env.clientOrigin
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.use(
    cors({
      origin(origin, cb) {
        // Allow requests with no Origin (server-to-server, curl) and allow-listed
        // browser origins. For anything else, decline CORS headers (cb(null,false))
        // rather than throwing — a same-origin request (e.g. the PDF renderer's
        // print page calling this same server) must still succeed; only genuine
        // cross-origin browser calls get blocked, by the browser, for lack of the
        // header. Throwing here would 500 the request instead.
        cb(null, !origin || allowedOrigins.includes(origin));
      },
    })
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  app.use(env.apiPrefix, apiRoutes);

  // Serve the built client (when present) so the PDF renderer can load the
  // /print pages, and so a single origin serves both API and app in production.
  const clientIndex = path.join(CLIENT_DIST, 'index.html');
  if (fs.existsSync(clientIndex)) {
    app.use(express.static(CLIENT_DIST));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith(env.apiPrefix)) return next();
      res.sendFile(clientIndex);
    });
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
