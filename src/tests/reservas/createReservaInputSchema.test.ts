import { describe, it, expect } from "vitest";
import { createReservaInputSchema } from "../../services/reservas/createReservaInputSchema";

describe("createReservaInputSchema", () => {
  it("valida una reserva correcta", () => {
    const data = {
      id_paciente: 1,
      id_disponibilidad: 5,
      fecha_reserva: "2025-05-20",
      id_estado_reserva: 2,
    };

    const result = createReservaInputSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("falla cuando falta un campo", () => {
    const data = {
      id_paciente: 1,
      fecha_reserva: "2025-01-01",
      id_estado_reserva: 2,
    };

    const result = createReservaInputSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});
