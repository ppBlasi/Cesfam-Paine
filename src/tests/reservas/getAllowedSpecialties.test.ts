import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAllowedSpecialties } from "../../services/reservas/getAllowedSpecialties";

describe("getAllowedSpecialties", () => {
  let prismaMock;

  beforeEach(() => {
    prismaMock = {
      paciente: { findUnique: vi.fn() },
      especialidad: { findMany: vi.fn() },
    };
  });

  it("retorna error si el paciente no existe", async () => {
    prismaMock.paciente.findUnique.mockResolvedValue(null);

    const result = await getAllowedSpecialties(1, prismaMock);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Paciente no existe");
  });

  it("retorna error si no tiene empresa", async () => {
    prismaMock.paciente.findUnique.mockResolvedValue({
      id_paciente: 1,
      id_empresa: null,
    });

    const result = await getAllowedSpecialties(1, prismaMock);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Paciente no tiene empresa asociada");
  });

  it("devuelve especialidades permitidas", async () => {
    prismaMock.paciente.findUnique.mockResolvedValue({
      id_paciente: 1,
      id_empresa: 10,
    });

    prismaMock.especialidad.findMany.mockResolvedValue([
      { id_especialidad: 50, nombre: "Kinesiología" },
    ]);

    const result = await getAllowedSpecialties(1, prismaMock);

    expect(result.ok).toBe(true);
    expect(result.especialidades.length).toBe(1);
  });
});
