/// <reference types="vitest" />

import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,                  // describe, it, vi sin importar
    environment: "node",            // Pruebas server-side / API
    setupFiles: ["./src/tests/setup-test.ts"], // Archivo de setup
    include: ["src/tests/**/*.test.ts"],       // Ubicación de tests
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
