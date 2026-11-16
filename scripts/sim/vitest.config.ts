/**
 * Config for the balance simulator — kept apart from the unit tests so
 * `npm test` never pays for a year of simulated play.
 */
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['scripts/sim/**/*.sim.ts'],
    testTimeout: 600_000,
  },
});
