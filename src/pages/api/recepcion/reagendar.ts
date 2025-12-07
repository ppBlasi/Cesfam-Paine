export const prerender = false;
export const runtime = "nodejs";

import type { APIRoute, AstroCookies } from "astro";
import { prisma } from "../../../lib/prisma";
import { ADMIN_CARGO, GENERAL_SPECIALTY_NAME, getWorkerByRut } from "../../../utils/admin";
import { SESSION_COOKIE_NAME, getSessionFromToken } from "../../../utils/session";
import { normalizeRut } from "../../../utils/rut";

const jsonResponse = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const ensureReceptionSession = async (cookies: AstroCookies) => {
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

  if (!worker || (worker.cargo !== "RECEPCION" && worker.cargo !== ADMIN_CARGO)) {
    return null;
  }

  return worker;
};

export const PUT: APIRoute = async ({ request, cookies }) => {
  const worker = await ensureReceptionSession(cookies);

  if (!worker) {
    return jsonResponse(403, { error: "Debes iniciar sesion como recepcion para editar reservas." });
  }

  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return jsonResponse(400, { error: "Solicitud invalida." });
  }

  const rut = String((payload as Record<string, unknown>).rut ?? "").trim();
  const oldAvailabilityId = Number((payload as Record<string, unknown>).oldAvailabilityId);
  const newAvailabilityId = Number((payload as Record<string, unknown>).newAvailabilityId);

  if (!rut) {
    return jsonResponse(400, { error: "Debes indicar el RUT del paciente." });
  }

  if (
    !Number.isInteger(oldAvailabilityId) ||
    !Number.isInteger(newAvailabilityId) ||
    oldAvailabilityId <= 0 ||
    newAvailabilityId <= 0
  ) {
    return jsonResponse(400, { error: "Selecciona horarios validos para reagendar." });
  }

  if (oldAvailabilityId === newAvailabilityId) {
    return jsonResponse(400, { error: "Debes elegir un horario distinto al actual." });
  }

  const normalizedRut = normalizeRut(rut);

  if (!normalizedRut) {
    return jsonResponse(400, { error: "El RUT ingresado no es valido." });
  }

  const patient = await prisma.paciente.findFirst({
    where: { rut_paciente: normalizedRut },
    select: { id_paciente: true },
  });

  if (!patient) {
    return jsonResponse(404, { error: "No encontramos un paciente con ese RUT." });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const now = new Date();

      const currentSlot = await tx.disponibilidadTrabajador.findUnique({
        where: { id_disponibilidad: oldAvailabilityId },
        select: {
          id_paciente: true,
          estado: true,
          fecha: true,
          trabajador: {
            select: {
              estado_trabajador: true,
              especialidad: { select: { nombre_especialidad: true } },
            },
          },
        },
      });

      if (
        !currentSlot ||
        currentSlot.estado !== "reservado" ||
        currentSlot.id_paciente !== patient.id_paciente ||
        currentSlot.fecha < now
      ) {
        throw new Error("current-slot-invalid");
      }

      const currentSpecialty =
        currentSlot.trabajador.especialidad?.nombre_especialidad ?? GENERAL_SPECIALTY_NAME;

      const newSlot = await tx.disponibilidadTrabajador.findUnique({
        where: { id_disponibilidad: newAvailabilityId },
        select: {
          estado: true,
          fecha: true,
          trabajador: {
            select: {
              estado_trabajador: true,
              especialidad: { select: { nombre_especialidad: true } },
            },
          },
        },
      });

      if (
        !newSlot ||
        newSlot.estado !== "disponible" ||
        newSlot.fecha < now ||
        newSlot.trabajador.estado_trabajador !== "Activo"
      ) {
        throw new Error("new-slot-unavailable");
      }

      const newSpecialty = newSlot.trabajador.especialidad?.nombre_especialidad ?? GENERAL_SPECIALTY_NAME;
      if (newSpecialty !== currentSpecialty) {
        throw new Error("different-specialty");
      }

      await tx.disponibilidadTrabajador.update({
        where: { id_disponibilidad: oldAvailabilityId },
        data: {
          estado: "disponible",
          id_paciente: null,
          nota: null,
        },
      });

      const updated = await tx.disponibilidadTrabajador.update({
        where: { id_disponibilidad: newAvailabilityId },
        data: {
          estado: "reservado",
          id_paciente: patient.id_paciente,
        },
        select: {
          id_disponibilidad: true,
          fecha: true,
          trabajador: {
            select: {
              especialidad: { select: { nombre_especialidad: true } },
              primer_nombre_trabajador: true,
              segundo_nombre_trabajador: true,
              apellido_p_trabajador: true,
              apellido_m_trabajador: true,
            },
          },
        },
      });

      return updated;
    });

    if (!result) {
      return jsonResponse(500, { error: "No pudimos editar la reserva." });
    }

    const doctorName = [
      result.trabajador.primer_nombre_trabajador,
      result.trabajador.segundo_nombre_trabajador,
      result.trabajador.apellido_p_trabajador,
      result.trabajador.apellido_m_trabajador,
    ]
      .filter(Boolean)
      .join(" ");

    return jsonResponse(200, {
      message: "Reserva actualizada correctamente.",
      booking: {
        disponibilidadId: result.id_disponibilidad,
        fecha: result.fecha.toISOString(),
        doctor: doctorName,
        specialty: result.trabajador.especialidad?.nombre_especialidad ?? GENERAL_SPECIALTY_NAME,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "current-slot-invalid") {
        return jsonResponse(404, { error: "No encontramos la reserva a editar." });
      }
      if (error.message === "new-slot-unavailable") {
        return jsonResponse(409, { error: "La nueva hora ya no esta disponible." });
      }
      if (error.message === "different-specialty") {
        return jsonResponse(400, { error: "Solo puedes reagendar dentro de la misma especialidad." });
      }
    }

    console.error("reception reschedule error", error);
    return jsonResponse(500, { error: "Ocurrio un problema al editar la reserva." });
  }
};
