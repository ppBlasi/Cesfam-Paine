export const prerender = false;
export const runtime = "nodejs";

import type { APIRoute } from "astro";
import { prisma } from "../../../lib/prisma";
import {
  GENERAL_SPECIALTY_NAME,
  getWorkerByRut,
} from "../../../utils/admin";
import {
  SESSION_COOKIE_NAME,
  getSessionFromToken,
} from "../../../utils/session";

const jsonResponse = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const MAX_NOTES_LENGTH = 240;

const ensurePatientSession = async (cookies: APIRoute["context"]["cookies"]) => {
  const token = cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const session = await getSessionFromToken(token);

  if (!session) {
    cookies.delete(SESSION_COOKIE_NAME, { path: "/" });
    return null;
  }

  const worker = await getWorkerByRut(session.usuario.rut);

  if (worker) {
    return null;
  }

  return session;
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = await ensurePatientSession(cookies);

  if (!session) {
    return jsonResponse(401, { error: "Debes iniciar sesion como paciente para reservar una hora." });
  }

  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return jsonResponse(400, { error: "Solicitud invalida." });
  }

  const availabilityId = Number((payload as Record<string, unknown>).disponibilidadId);
  const notesRaw = (payload as Record<string, unknown>).nota;
  const notes =
    typeof notesRaw === "string"
      ? notesRaw.trim().slice(0, MAX_NOTES_LENGTH)
      : "";

  if (!Number.isInteger(availabilityId) || availabilityId <= 0) {
    return jsonResponse(400, { error: "Bloque seleccionado invalido." });
  }

  const patient = await prisma.paciente.findFirst({
    where: { rut_paciente: session.usuario.rut },
    select: {
      id_paciente: true,
      primer_nombre_paciente: true,
      apellido_p_paciente: true,
      correo_paciente: true,
    },
  });

  if (!patient) {
    return jsonResponse(404, {
      error: "No encontramos tu ficha de paciente. Acude al CESFAM para actualizar tus datos.",
    });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.disponibilidadTrabajador.updateMany({
        where: {
          id_disponibilidad: availabilityId,
          estado: "disponible",
          fecha: { gte: new Date() },
          trabajador: {
            estado_trabajador: "Activo",
            especialidad: {
              nombre_especialidad: GENERAL_SPECIALTY_NAME,
            },
          },
        },
        data: {
          estado: "reservado",
          id_paciente: patient.id_paciente,
          nota: notes || null,
        },
      });

      if (updated.count === 0) {
        throw new Error("slot-not-available");
      }

      return tx.disponibilidadTrabajador.findUnique({
        where: { id_disponibilidad: availabilityId },
        include: {
          trabajador: {
            select: {
              id_trabajador: true,
              primer_nombre_trabajador: true,
              segundo_nombre_trabajador: true,
              apellido_p_trabajador: true,
              apellido_m_trabajador: true,
              especialidad: {
                select: { nombre_especialidad: true },
              },
            },
          },
        },
      });
    });

    if (!result) {
      return jsonResponse(500, { error: "No pudimos confirmar la reserva." });
    }

    const doctorName = [
      result.trabajador.primer_nombre_trabajador,
      result.trabajador.segundo_nombre_trabajador,
      result.trabajador.apellido_p_trabajador,
      result.trabajador.apellido_m_trabajador,
    ]
      .filter(Boolean)
      .join(" ");

    return jsonResponse(201, {
      message: "Hora reservada exitosamente. Recibiras la confirmacion en tu correo.",
      booking: {
        disponibilidadId: result.id_disponibilidad,
        fecha: result.fecha.toISOString(),
        doctor: doctorName,
        specialty: result.trabajador.especialidad?.nombre_especialidad ?? GENERAL_SPECIALTY_NAME,
        nota: result.nota,
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "slot-not-available"
    ) {
      return jsonResponse(409, {
        error: "La hora seleccionada ya no esta disponible. Actualiza la pagina e intenta con otro horario.",
      });
    }

    console.error("reserve slot error", error);
    return jsonResponse(500, {
      error: "No pudimos completar la reserva. Intenta mas tarde.",
    });
  }
};
