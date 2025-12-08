/// <reference types="vitest" />

import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import path from "path";

export default defineConfig({
  plugins: [vue()],

  test: {
    globals: true,

    // 👇 Ambiente DOM necesario para Vue Test Utils
    environment: "jsdom",

    setupFiles: ["./src/tests/setup-test.ts"],

    include: [
      "src/tests/**/*.test.ts",
      "src/tests/components/**/*.test.ts",
    ],

    deps: {
      inline: ["vue", "@vue"], // evita errores de transformación
    },

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
