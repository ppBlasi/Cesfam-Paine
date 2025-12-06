import { describe, it, expect } from "vitest";
import { ensurePatientSession } from "../../services/reservas/ensurePatientSession";

describe("ensurePatientSession", () => {
  it("retorna ok=true cuando hay sesión válida", () => {
    const session = {
      user: {
        id_paciente: 77
      }
    };

    const result = ensurePatientSession(session);

    expect(result.ok).toBe(true);
    expect(result.id_paciente).toBe(77);
  });

  it("retorna error si no hay sesión", () => {
    const result = ensurePatientSession(null);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Sesión no encontrada");
  });

  it("retorna error si el usuario no es paciente", () => {
    const result = ensurePatientSession({ user: {} });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("El usuario no es paciente");
  });
});
