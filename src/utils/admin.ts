import { prisma } from "../lib/prisma";

export const ADMIN_SPECIALTY_NAME = "Administracion";
export const GENERAL_SPECIALTY_NAME = "Medicina General";

export const getWorkerByRut = async (rut: string) => {
  if (!rut) {
    return null;
  }

  return prisma.trabajador.findFirst({
    where: { rut_trabajador: rut },
    include: {
      especialidad: {
        select: {
          id_especialidad: true,
          nombre_especialidad: true,
        },
      },
    },
  });
};

export const isAdminByRut = async (rut: string) => {
  const worker = await getWorkerByRut(rut);
  return worker?.especialidad?.nombre_especialidad === ADMIN_SPECIALTY_NAME;
};
