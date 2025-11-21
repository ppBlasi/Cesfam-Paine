import { describe, it, expect } from "vitest";
import { normalizeRut } from "../../utils/rut";

const validateForm = (data: any) => {
  if (!data.nombre) return "nombre requerido";
  if (!data.rut) return "rut requerido";
  if (normalizeRut(data.rut).length < 3) return "rut inválido";
  if (!data.email.includes("@")) return "email inválido";
  return "ok";
};

describe("Validación de formularios", () => {
  it("debe fallar si falta nombre", () => {
    expect(validateForm({ rut: "12345678-5", email: "test@test.com" }))
      .toBe("nombre requerido");
  });

  it("debe fallar con rut inválido", () => {
    expect(validateForm({ nombre: "Juan", rut: "!", email: "test@test.com" }))
      .toBe("rut inválido");
  });

  it("debe fallar si el email es inválido", () => {
    expect(validateForm({ nombre: "Juan", rut: "12345678-5", email: "incorrecto" }))
      .toBe("email inválido");
  });

  it("debe validar correctamente un formulario correcto", () => {
    expect(
      validateForm({
        nombre: "Juan",
        rut: "12.345.678-5",
        email: "test@test.com",
      })
    ).toBe("ok");
  });
});
