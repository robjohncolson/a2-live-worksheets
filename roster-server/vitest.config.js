import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // BCRYPT_COST=4 (vs prod 12): the bcrypt-heavy auth paths (signup, change-
    // password, PIN, and the brute-force lockout which hashes many times) are the
    // root of the "passes isolated, flakes under load" tax — cost-12 bcryptjs is
    // ~256x slower than cost 4 and starves for CPU when ~65 files run in parallel.
    // Server reads process.env.BCRYPT_COST (clamped to a valid range); prod never
    // sets it, so this ONLY speeds up tests and never weakens real auth.
    env: { BCRYPT_COST: '4', USE_DISTRICT_FORMULA: 'false' },
    // Kept as headroom for any remaining crypto/pglite work under load.
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
