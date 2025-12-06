import { PrismaClient } from "@prisma/client";

/**
 * Se permite inyectar prisma desde los tests:
 *   cancelPastBookings(prismaMock)
 *
 * Si no se pasa, usa el Prisma real.
 */
export async function cancelPastBookings(prisma = new PrismaClient()) {
  const now = new Date();

  // 1. Buscar reservas pasadas
  const pastBookings = await prisma.reserva.findMany({
    where: {
      fecha_hora: {
        fecha_hora: { lt: now },
      },
      estado: {
        nombre_estado: { not: "cancelado" },
      },
    },
    include: {
      estado: true,
      fecha_hora: true,
    },
  });

  if (!pastBookings.length) {
    return { updated: 0 };
  }

  // 2. Buscar estado "cancelado"
  const estadoCancelado = await prisma.estadoReserva.findFirst({
    where: { nombre_estado: "cancelado" },
  });

  if (!estadoCancelado) {
    throw new Error("Estado 'cancelado' no está creado en la BD.");
  }

  // 3. Actualizar reservas
  const updates = pastBookings.map((r) =>
    prisma.reserva.update({
      where: { id_reserva: r.id_reserva },
      data: { id_estado_reserva: estadoCancelado.id_estado_reserva },
    })
  );

  await prisma.$transaction(updates);

  return { updated: pastBookings.length };
}
