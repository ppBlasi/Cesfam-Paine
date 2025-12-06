import { afterEach } from "vitest";
import { cleanup } from "@testing-library/vue";

// Limpia el DOM después de cada test
afterEach(() => {
  cleanup();
});
