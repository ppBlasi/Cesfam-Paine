import { describe, it, expect, vi, beforeEach } from "vitest";
import { cancelPastBookings } from "../../services/reservas/cancelPastBookings";

describe("cancelPastBookings", () => {
  let prismaMock;

  beforeEach(() => {
    prismaMock = {
      reserva: {
        findMany: vi.fn(),
        update: vi.fn(),
      },
      estadoReserva: {
        findFirst: vi.fn(),
      },
      $transaction: vi.fn(),
    };
  });

  it("retorna updated=0 cuando no hay reservas pasadas", async () => {
    prismaMock.reserva.findMany.mockResolvedValue([]);

    const result = await cancelPastBookings(prismaMock);

    expect(result.updated).toBe(0);
  });

  it("cancela reservas pasadas cuando existen", async () => {
    prismaMock.reserva.findMany.mockResolvedValue([
      { id_reserva: 1 }
    ]);

    prismaMock.estadoReserva.findFirst.mockResolvedValue({
      id_estado_reserva: 99,
    });

    prismaMock.reserva.update.mockResolvedValue({});
    prismaMock.$transaction.mockResolvedValue([]);

    const result = await cancelPastBookings(prismaMock);

    expect(result.updated).toBe(1);
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });

  it("lanza error si 'cancelado' no existe", async () => {
    prismaMock.reserva.findMany.mockResolvedValue([{ id_reserva: 1 }]);
    prismaMock.estadoReserva.findFirst.mockResolvedValue(null);

    await expect(cancelPastBookings(prismaMock)).rejects.toThrow(
      "Estado 'cancelado' no está creado en la BD."
    );
  });
});
