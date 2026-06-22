import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const sharedEntry = fileURLToPath(
  new URL("../../packages/shared/src/index.ts", import.meta.url),
);

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    exclude: ["e2e/**", "node_modules/**"],
  },
  resolve: {
    alias: {
      "@": appRoot,
      "@clipwise/shared": sharedEntry,
    },
  },
});
