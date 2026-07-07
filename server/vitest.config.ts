import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', '__tests__/**/*.test.ts'],
    // The integration suite hits one real, shared Postgres instance and the
    // domain has genuine global invariants (e.g. only one active season at a
    // time) — running test files in parallel makes them race each other.
    // The engine's own unit tests don't care either way; this just keeps
    // the whole suite deterministic.
    fileParallelism: false,
  },
});
