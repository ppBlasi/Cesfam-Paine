import { describe, it, expect } from "vitest";
import { normalizeRut } from "../../utils/rut";

describe("normalizeRut", () => {
  it("debe eliminar puntos y guiones", () => {
    expect(normalizeRut("12.345.678-9")).toBe("12345678-9");
  });

  it("debe convertir k a K", () => {
    expect(normalizeRut("12.345.678-k")).toBe("12345678-K");
  });

  it("debe mantener formato si ya es correcto", () => {
    expect(normalizeRut("12345678-9")).toBe("12345678-9");
  });

  it("debe manejar strings vacíos", () => {
    expect(normalizeRut("")).toBe("");
  });

  it("debe manejar solo dígito verificador", () => {
    expect(normalizeRut("k")).toBe("K");
  });

  it("debe remover caracteres inválidos", () => {
    expect(normalizeRut("12a34b5678-c9")).toBe("12345678-9");
  });

  it("debe formatear rut sin guion", () => {
    expect(normalizeRut("12345678k")).toBe("12345678-K");
  });

  it("debe aceptar rut con espacios", () => {
    expect(normalizeRut("   12.345.678-9   ")).toBe("12345678-9");
  });

  it("debe manejar rut con símbolos raros", () => {
    expect(normalizeRut("12.345.*678-K")).toBe("12345678-K");
  });

  it("debe manejar rut muy corto", () => {
    expect(normalizeRut("1")).toBe("1");
  });
});
