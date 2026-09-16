import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/district/**/*.test.js'],
    env: { BCRYPT_COST: '4', USE_DISTRICT_FORMULA: 'true' },
    setupFiles: ['tests/district/setup.js'],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
