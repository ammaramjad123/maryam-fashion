import morgan from 'morgan';
import env from '../config/env.js';

// Concise colored logs in dev, Apache-style combined logs in production.
const requestLogger = morgan(env.isProd ? 'combined' : 'dev');

export default requestLogger;
