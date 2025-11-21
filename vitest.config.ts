/// <reference types="vitest" />

import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,                  // describe, it, expect, vi
    environment: "node",            // pruebas server/API
    setupFiles: ["./src/tests/setup-test.ts"], // archivo de configuración global
    include: ["src/tests/**/*.test.ts"],       // carpeta donde están los tests

    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@api": path.resolve(__dirname, "src/pages/api"),
      "@utils": path.resolve(__dirname, "src/utils"),
      "@components": path.resolve(__dirname, "src/components"),
    },
  },
});
