import { describe, it, expect } from "vitest";
import { normalizeRut } from "../../../src/utils/rut";

describe("normalizeRut", () => {
  it("limpia puntos y guiones", () => {
    expect(normalizeRut("12.345.678-9")).toBe("12345678-9");
  });

  it("acepta dv k/K y la convierte a K", () => {
    expect(normalizeRut("12.345.678-k")).toBe("12345678-K");
  });

  it("devuelve string vacío si el rut es vacío", () => {
    expect(normalizeRut("")).toBe("");
  });
});
