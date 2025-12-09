export const prerender = false;
export const runtime = "nodejs";

import type { APIRoute, AstroCookies } from "astro";
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
const CANCELLED_STATUS = "cancelado";
const normalizeSpecialty = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const getConsumedSpecialties = async (patientId: number) => {
  const records = await prisma.disponibilidadTrabajador.findMany({
    where: {
      id_paciente: patientId,
      estado: "finalizado",
    },
    select: {
      fecha: true,
      trabajador: {
        select: {
          especialidad: {
            select: { nombre_especialidad: true },
          },
        },
      },
    },
    orderBy: { fecha: "desc" },
  });

  const consumed = new Map<string, Date>();
  for (const item of records) {
    const name = item.trabajador.especialidad?.nombre_especialidad?.trim();
    if (!name || name === GENERAL_SPECIALTY_NAME) continue;
    const key = name.toLowerCase();
    if (!consumed.has(key)) {
      consumed.set(key, item.fecha);
    }
  }
  return consumed;
};

const getAllowedSpecialties = async (patientId: number, pendingExamOrders: Array<{ nombre_examen: string }> = []) => {
  const allowed = new Set<string>([GENERAL_SPECIALTY_NAME]);

  const consumed = await getConsumedSpecialties(patientId);

  const derivaciones = await prisma.consultaMedicaSlot.findMany({
    where: {
      id_paciente: patientId,
      derivacion: { not: null },
    },
    select: { derivacion: true, created_at: true, id_consulta: true },
    orderBy: [
      { created_at: "desc" },
      { id_consulta: "desc" },
    ],
  });

  for (const item of derivaciones) {
    const name = item.derivacion?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const consumedAt = consumed.get(key);
    const derivationAt = item.created_at ?? new Date(0);
    if (consumedAt && derivationAt <= consumedAt) continue;
    allowed.add(name);
  }

  if (pendingExamOrders.length > 0) {
    allowed.add("Enfermeria");
  }

  return allowed;
};

const ensurePatientSession = async (cookies: AstroCookies) => {
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

const cancelPastBookings = async (patientId: number) => {
  const now = new Date();
  await prisma.disponibilidadTrabajador.updateMany({
    where: {
      id_paciente: patientId,
      estado: "reservado",
      fecha: { lt: now },
    },
    data: {
      estado: CANCELLED_STATUS,
    },
  });
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

  await cancelPastBookings(patient.id_paciente);

  const pendingExamOrders = await prisma.examOrder.findMany({
    where: {
      paciente_id: patient.id_paciente,
      estado: "PENDIENTE",
      scheduled_at: null,
    },
    select: { id: true, nombre_examen: true },
  });

  const allowedSpecialtiesSet = await getAllowedSpecialties(patient.id_paciente, pendingExamOrders);
  const allowedNormalized = new Set(Array.from(allowedSpecialtiesSet).map((name) => normalizeSpecialty(name)));

  try {
    const result = await prisma.$transaction(async (tx) => {
      const now = new Date();

      const slot = await tx.disponibilidadTrabajador.findUnique({
        where: { id_disponibilidad: availabilityId },
        select: {
          estado: true,
          fecha: true,
          id_disponibilidad: true,
          trabajador: {
            select: {
              id_trabajador: true,
              estado_trabajador: true,
              especialidad: {
                select: { nombre_especialidad: true },
              },
            },
          },
        },
      });

      if (!slot) {
        throw new Error("slot-not-found");
      }

      const slotSpecialty = slot.trabajador.especialidad?.nombre_especialidad ?? GENERAL_SPECIALTY_NAME;
      const slotSpecialtyNormalized = normalizeSpecialty(slotSpecialty);
      if (!allowedNormalized.has(slotSpecialtyNormalized)) {
        throw new Error("specialty-not-allowed");
      }

      const existingBooking = await tx.disponibilidadTrabajador.findFirst({
        where: {
          id_paciente: patient.id_paciente,
          estado: { in: ["reservado", "confirmado", "ingresado", "en_curso"] },
          fecha: { gte: now },
          trabajador: {
            especialidad: {
              nombre_especialidad: slotSpecialty,
            },
          },
        },
        select: { id_disponibilidad: true },
      });

      if (existingBooking) {
        throw new Error("specialty-already-booked");
      }

      let examOrderId: bigint | null = null;
      if (slotSpecialtyNormalized === "enfermeria") {
        const examIdRaw = (payload as Record<string, unknown>).examOrderId;
        if (examIdRaw === undefined || examIdRaw === null || examIdRaw === "") {
          throw new Error("exam-required");
        }
        try {
          examOrderId = BigInt(
            typeof examIdRaw === "string" || typeof examIdRaw === "number" ? examIdRaw : "",
          );
        } catch {
          throw new Error("exam-invalid");
        }

        const examOrder = await tx.examOrder.findUnique({
          where: { id: examOrderId },
          select: { id: true, paciente_id: true, estado: true, scheduled_at: true },
        });

        if (!examOrder || examOrder.paciente_id !== patient.id_paciente) {
          throw new Error("exam-not-found");
        }
        if (examOrder.estado !== "PENDIENTE" || examOrder.scheduled_at) {
          throw new Error("exam-already-scheduled");
        }
      }

      if (slot.estado !== "disponible" || slot.fecha < now || slot.trabajador.estado_trabajador !== "Activo") {
        throw new Error("slot-not-available");
      }

      const updated = await tx.disponibilidadTrabajador.updateMany({
        where: {
          id_disponibilidad: availabilityId,
          estado: "disponible",
          fecha: { gte: now },
          trabajador: {
            estado_trabajador: "Activo",
            especialidad: {
              nombre_especialidad: slotSpecialty,
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

      const booking = await tx.disponibilidadTrabajador.findUnique({
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

      if (!booking) {
        throw new Error("slot-not-found");
      }

      if (slotSpecialty.toLowerCase() === "enfermeria" && examOrderId) {
        await tx.examOrder.update({
          where: { id: examOrderId },
          data: {
            estado: "AGENDADO",
            scheduled_at: booking.fecha,
            nurse_id: booking.trabajador.id_trabajador,
            updated_at: new Date(),
          },
        });
      }

      return booking;
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

      if (error instanceof Error && error.message === "slot-not-found") {
        return jsonResponse(404, { error: "No encontramos el bloque solicitado." });
      }

      if (error instanceof Error && error.message === "specialty-not-allowed") {
        return jsonResponse(403, {
          error: "No cuentas con una derivacion valida para reservar esta especialidad.",
        });
      }

      if (error instanceof Error && error.message === "specialty-already-booked") {
        return jsonResponse(409, {
          error: "No puede reservar 2 horas para una misma especialidad. Ya tienes una hora reservada.",
        });
      }

      if (error instanceof Error && error.message === "exam-required") {
        return jsonResponse(400, { error: "Debes seleccionar el examen que quieres agendar." });
      }

      if (error instanceof Error && error.message === "exam-invalid") {
        return jsonResponse(400, { error: "Examen invalido." });
      }

      if (error instanceof Error && error.message === "exam-not-found") {
        return jsonResponse(404, { error: "No encontramos el examen seleccionado." });
      }

      if (error instanceof Error && error.message === "exam-already-scheduled") {
        return jsonResponse(409, { error: "Este examen ya tiene una hora agendada." });
      }

      console.error("reserve slot error", error);
      return jsonResponse(500, {
        error: "No pudimos completar la reserva. Intenta mas tarde.",
      });
  }
};

export const PUT: APIRoute = async ({ request, cookies }) => {
  const session = await ensurePatientSession(cookies);

  if (!session) {
    return jsonResponse(401, { error: "Debes iniciar sesion como paciente para editar una reserva." });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return jsonResponse(400, { error: "Solicitud invalida." });
  }

  const oldAvailabilityId = Number((payload as Record<string, unknown>).oldAvailabilityId);
  const newAvailabilityId = Number((payload as Record<string, unknown>).newAvailabilityId);

  if (!Number.isInteger(oldAvailabilityId) || oldAvailabilityId <= 0 || !Number.isInteger(newAvailabilityId) || newAvailabilityId <= 0) {
    return jsonResponse(400, { error: "Bloques de reserva invalidos." });
  }

  if (oldAvailabilityId === newAvailabilityId) {
    return jsonResponse(400, { error: "Selecciona una hora distinta para reagendar." });
  }

  const patient = await prisma.paciente.findFirst({
    where: { rut_paciente: session.usuario.rut },
    select: { id_paciente: true },
  });

  if (!patient) {
    return jsonResponse(404, { error: "No encontramos tu ficha de paciente." });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const now = new Date();

      const currentSlot = await tx.disponibilidadTrabajador.findUnique({
        where: { id_disponibilidad: oldAvailabilityId },
        select: {
          estado: true,
          fecha: true,
          id_paciente: true,
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
        currentSlot.id_paciente !== patient.id_paciente ||
        currentSlot.estado !== "reservado" ||
        currentSlot.fecha < now
      ) {
        throw new Error("current-slot-invalid");
      }

      const specialtyName = currentSlot.trabajador.especialidad?.nombre_especialidad ?? GENERAL_SPECIALTY_NAME;

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

      if (!newSlot || newSlot.estado !== "disponible" || newSlot.fecha < now || newSlot.trabajador.estado_trabajador !== "Activo") {
        throw new Error("new-slot-unavailable");
      }

      const newSpecialty = newSlot.trabajador.especialidad?.nombre_especialidad ?? GENERAL_SPECIALTY_NAME;
      if (newSpecialty !== specialtyName) {
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
      return jsonResponse(500, { error: "No pudimos reagendar tu reserva." });
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
        return jsonResponse(404, { error: "No encontramos tu reserva para editar." });
      }
      if (error.message === "new-slot-unavailable") {
        return jsonResponse(409, { error: "La nueva hora no está disponible." });
      }
      if (error.message === "different-specialty") {
        return jsonResponse(400, { error: "Solo puedes reagendar dentro de la misma especialidad." });
      }
    }

    console.error("reschedule reservation error", error);
    return jsonResponse(500, { error: "No pudimos editar la reserva. Intenta más tarde." });
  }
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
  const session = await ensurePatientSession(cookies);

  if (!session) {
    return jsonResponse(401, { error: "Debes iniciar sesion como paciente para cancelar una reserva." });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return jsonResponse(400, { error: "Solicitud invalida." });
  }

  const availabilityId = Number((payload as Record<string, unknown>).disponibilidadId);
  if (!Number.isInteger(availabilityId) || availabilityId <= 0) {
    return jsonResponse(400, { error: "Bloque seleccionado invalido." });
  }

  const patient = await prisma.paciente.findFirst({
    where: { rut_paciente: session.usuario.rut },
    select: { id_paciente: true },
  });

  if (!patient) {
    return jsonResponse(404, { error: "No encontramos tu ficha de paciente. Acude al CESFAM para actualizar tus datos." });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const slot = await tx.disponibilidadTrabajador.findUnique({
        where: { id_disponibilidad: availabilityId },
        select: {
          id_paciente: true,
          estado: true,
          fecha: true,
        },
      });

      if (!slot || slot.id_paciente !== patient.id_paciente || slot.estado !== "reservado") {
        throw new Error("slot-not-cancelable");
      }

      if (slot.fecha < new Date()) {
        throw new Error("slot-in-past");
      }

      return tx.disponibilidadTrabajador.update({
        where: { id_disponibilidad: availabilityId },
        data: {
          estado: "disponible",
          id_paciente: null,
          nota: null,
        },
        select: { id_disponibilidad: true },
      });
    });

    if (!result) {
      return jsonResponse(500, { error: "No pudimos cancelar la reserva." });
    }

    return jsonResponse(200, { message: "Reserva cancelada correctamente." });
  } catch (error) {
    if (error instanceof Error && error.message === "slot-not-cancelable") {
      return jsonResponse(404, { error: "No pudimos encontrar una reserva activa para cancelar." });
    }

    if (error instanceof Error && error.message === "slot-in-past") {
      return jsonResponse(409, { error: "No puedes cancelar una reserva que ya vencio." });
    }

    console.error("cancel reservation error", error);
    return jsonResponse(500, { error: "No pudimos cancelar la reserva. Intenta mas tarde." });
  }
};
