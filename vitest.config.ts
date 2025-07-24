import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["vitest.setup.js"],
    include: ["src/**/*_test.ts"],
    environment: "jsdom",
    globals: true,
  },
});
