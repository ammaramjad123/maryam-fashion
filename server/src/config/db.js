import mongoose from 'mongoose';
import env from './env.js';

/**
 * Connect to MongoDB. The server stays up even if the first connection attempt
 * fails (so /api/v1/health still answers) — Mongoose retries in the background
 * and the health check reports the live connection state.
 */
export async function connectDb() {
  mongoose.connection.on('connected', () => {
    console.log('[db] MongoDB connected');
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('[db] MongoDB disconnected');
  });
  mongoose.connection.on('error', (err) => {
    console.error('[db] MongoDB error:', err.message);
  });

  try {
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
  } catch (err) {
    console.warn(
      `[db] Initial MongoDB connection failed (${err.message}). ` +
        'Server will keep running; check MONGODB_URI and that MongoDB is up.'
    );
  }
}

/** Human-readable connection state for the health check. */
export function dbState() {
  return ['disconnected', 'connected', 'connecting', 'disconnecting'][
    mongoose.connection.readyState
  ];
}
