import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        isolate: true,
      },
    },
    sequence: {
      concurrent: false,
      hooks: 'list',
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    isolate: true,
  },
});
