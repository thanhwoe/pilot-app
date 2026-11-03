import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // The same `@/` alias as tsconfig.json, so tests import app code the way the app does.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Playwright owns e2e/; Vitest runs only the unit tests next to the code.
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
