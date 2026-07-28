# Maryam Fashion — backend image for Render.
# Builds the API + an in-image copy of the client so the PDF renderer can load
# the /print pages SAME-ORIGIN (no cross-origin call needed for PDF export).
# Ships the system libraries headless Chrome (Puppeteer) needs on Debian.
FROM node:20-bookworm-slim

# --- Chrome runtime libraries (Puppeteer downloads Chrome itself during npm ci) ---
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates fonts-liberation \
      libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 \
      libdbus-1-3 libdrm2 libexpat1 libgbm1 libglib2.0-0 libnspr4 libnss3 \
      libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 \
      libxfixes3 libxkbcommon0 libxrandr2 \
  && rm -rf /var/lib/apt/lists/*

# Deterministic Chrome location, baked into the image at install time.
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

WORKDIR /app

# Install workspace deps first (better layer caching). NODE_ENV is intentionally
# NOT set to production here, so the client's dev deps (vite) install for the build.
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci

# Copy the source and build the client. VITE_API_BASE_URL is unset → '' → the
# in-image client calls the API same-origin, which is exactly what PDF needs.
COPY . .
RUN npm run build -w client

# Runtime: Render provides PORT; the app reads it. NODE_ENV=production is set as
# a Render env var (it also gates the JWT-secret strength check).
EXPOSE 5000
CMD ["node", "server/src/index.js"]
