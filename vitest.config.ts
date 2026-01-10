/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["ts/**/*.spec.ts"],
    exclude: ["ts/**/*.bun.spec.ts", "node_modules/**/*"],
    fileParallelism: false,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
        isolate: true,
      },
    },
    sequence: {
      concurrent: false,
      hooks: "list",
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    isolate: true,
  },
  define: {
    "import.meta.vitest": false,
  },
});
