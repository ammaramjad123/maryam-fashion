import mongoose from 'mongoose';
import env from '../config/env.js';
import User from '../models/User.js';

/**
 * Seed a single ADMIN user from env vars. Idempotent: if the email already
 * exists it reports and exits without changing the password.
 *
 * Required env: SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD (SEED_ADMIN_NAME optional).
 */
async function run() {
  const { name, email, password } = env.seedAdmin;

  if (!email || !password) {
    console.error('[seed] SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in server/.env');
    process.exit(1);
  }

  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });

  try {
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      console.log(
        `[seed] Admin already exists: ${existing.email} (role ${existing.role}). Skipped.`
      );
      return;
    }

    const user = await User.create({
      name,
      email,
      passwordHash: await User.hashPassword(password),
      role: 'ADMIN',
      permissions: { viewProfit: true }, // ADMIN sees profit; OPERATOR seeds false.
      isActive: true,
    });

    console.log(`[seed] Created ADMIN ${user.email} (viewProfit: ${user.permissions.viewProfit}).`);
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error('[seed] Failed:', err.message);
  process.exit(1);
});
