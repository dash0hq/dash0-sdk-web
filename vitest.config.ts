import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*_test.ts"],
    environment: "jsdom",
    globals: true,
  },
});
