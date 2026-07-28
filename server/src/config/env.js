import dotenv from 'dotenv';

dotenv.config();

const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/garments_day_end',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  apiPrefix: '/api/v1',

  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  // Where the PDF renderer loads the /print pages. Empty → derive from the
  // request (the server serves the built client). Set to the Vite dev URL
  // (http://localhost:5173) to render live client edits during development.
  printBaseUrl: process.env.PRINT_BASE_URL || '',

  seedAdmin: {
    name: process.env.SEED_ADMIN_NAME || 'Admin',
    email: process.env.SEED_ADMIN_EMAIL || 'admin@shop.local',
    password: process.env.SEED_ADMIN_PASSWORD || '',
  },
};

env.isProd = env.nodeEnv === 'production';

// Fail fast in production if the JWT secret was never set to a real value — a
// default/short secret would let anyone forge admin tokens.
const WEAK_SECRETS = new Set(['dev-only-change-me', 'change-me', '']);
if (env.isProd && (WEAK_SECRETS.has(env.jwtSecret) || env.jwtSecret.length < 32)) {
  throw new Error(
    'JWT_SECRET must be set to a strong random string (>= 32 chars) in production. ' +
      'Generate one with:  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
  );
}

export default env;
