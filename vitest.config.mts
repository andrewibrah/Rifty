import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = dirname(moduleFilename);

export default defineConfig({
  optimizeDeps: {
    exclude: ["react-native"],
  },
  resolve: {
    alias: {
      "@": resolve(moduleDirname, "src"),
      "react-native": resolve(moduleDirname, "tests/mocks/react-native.ts"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: [resolve(moduleDirname, "tests/test-setup.ts")],
    coverage: {
      reporter: ["text", "json", "html"],
      thresholds: {
        global: {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90,
        },
      },
    },
  },
});
