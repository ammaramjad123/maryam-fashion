import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // Spinning up an in-memory Mongo replica set (first run downloads a binary)
    // can be slow, so give the lifecycle hooks generous timeouts.
    hookTimeout: 120000,
    testTimeout: 30000,
    // The engine touches a shared DB; run test files serially.
    fileParallelism: false,
  },
});
