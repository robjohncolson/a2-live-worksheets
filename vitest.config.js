import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    // Each Desk journey boots several full DOMs. Bound concurrency so their
    // existing deadlines measure behavior instead of host CPU contention.
    maxWorkers: 4,
    minWorkers: 1,
    include: ['tests/**/*.test.js', 'lib/**/*.test.js'],
    exclude: configDefaults.exclude,
    coverage: { provider: 'v8', reporter: ['text', 'html'], include: ['gradebook-client.js', 'flashcards.js', 'offline-queue.js'] }
  }
});
