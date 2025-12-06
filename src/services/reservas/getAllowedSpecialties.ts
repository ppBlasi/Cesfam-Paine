import { PrismaClient } from "@prisma/client";

/**
 * Obtiene especialidades permitidas para un paciente.
 *
 * Permite inyectar prisma desde los tests:
 *   getAllowedSpecialties(77, prismaMock)
 */
export async function getAllowedSpecialties(id_paciente, prisma = new PrismaClient()) {
  const paciente = await prisma.paciente.findUnique({
    where: { id_paciente },
    include: { empresa: true },
  });

  if (!paciente) {
    return { ok: false, error: "Paciente no existe" };
  }

  if (!paciente.id_empresa) {
    return { ok: false, error: "Paciente no tiene empresa asociada" };
  }

  const allowed = await prisma.especialidad.findMany({
    where: {
      trabajadores: {
        some: { id_empresa: paciente.id_empresa },
      },
    },
  });

  return { ok: true, especialidades: allowed };
}
