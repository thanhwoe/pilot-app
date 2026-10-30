import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Playwright owns e2e/; Vitest runs only the unit tests next to the code.
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
