import { describe, it, expect } from "vitest";
import { normalizeRut } from "../../../src/utils/rut";

describe("Auth | Normalización de RUT", () => {
  it("debe limpiar puntos y guion y dejarlos normalizados", () => {
    expect(normalizeRut("12.345.678-9")).toBe("12345678-9");
  });

  it("debe aceptar minúscula k y convertirla a K", () => {
    expect(normalizeRut("12345678-k")).toBe("12345678-K");
  });

  it("debe retornar string vacío si entra vacío", () => {
    expect(normalizeRut("")).toBe("");
  });

  it("debe retornar solo el dígito verificador si la longitud es 1", () => {
    expect(normalizeRut("k")).toBe("K");
  });
});
