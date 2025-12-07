export const prerender = false;
export const runtime = "nodejs";

import type { APIRoute, AstroCookies } from "astro";
import { prisma } from "../../../lib/prisma";
import { SESSION_COOKIE_NAME, getSessionFromToken } from "../../../utils/session";
import { getWorkerByRut, ADMIN_CARGO } from "../../../utils/admin";
import { normalizeRut } from "../../../utils/rut";

const jsonResponse = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const MAX_NOTES_LENGTH = 240;
const CANCELLED_STATUS = "cancelado";

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

export const POST: APIRoute = async ({ request, cookies }) => {
  const worker = await ensureReceptionSession(cookies);

  if (!worker) {
    return jsonResponse(403, { error: "Debes iniciar sesion como recepcion para asignar reservas." });
  }

  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return jsonResponse(400, { error: "Solicitud invalida." });
  }

  const rut = String((payload as Record<string, unknown>).rut ?? "").trim();
  const disponibilidadId = Number((payload as Record<string, unknown>).disponibilidadId);
  const notaRaw = (payload as Record<string, unknown>).nota;
  const nota =
    typeof notaRaw === "string" ? notaRaw.trim().slice(0, MAX_NOTES_LENGTH) : "";

  if (!rut) {
    return jsonResponse(400, { error: "Debes ingresar el RUT del paciente." });
  }

  if (!Number.isInteger(disponibilidadId) || disponibilidadId <= 0) {
    return jsonResponse(400, { error: "Selecciona un bloque de horario valido." });
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
    return jsonResponse(404, {
      error: "No encontramos un paciente con ese RUT. Verifica en sistemas.",
    });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.disponibilidadTrabajador.updateMany({
        where: {
          id_paciente: patient.id_paciente,
          estado: "reservado",
          fecha: { lt: new Date() },
        },
        data: { estado: CANCELLED_STATUS },
      });

      const slot = await tx.disponibilidadTrabajador.findUnique({
        where: { id_disponibilidad: disponibilidadId },
        select: {
          estado: true,
          fecha: true,
        },
      });

      if (!slot || slot.estado !== "disponible" || slot.fecha < new Date()) {
        throw new Error("slot-not-available");
      }

      await tx.disponibilidadTrabajador.update({
        where: { id_disponibilidad: disponibilidadId },
        data: {
          estado: "reservado",
          id_paciente: patient.id_paciente,
          nota: nota || null,
        },
      });
    });

    return jsonResponse(200, {
      message: "Hora asignada correctamente. Recuerda informar al paciente.",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "slot-not-available") {
      return jsonResponse(409, {
        error: "La hora seleccionada ya fue tomada. Actualiza la lista e intenta nuevamente.",
      });
    }

    console.error("reception assign error", error);
    return jsonResponse(500, {
      error: "No pudimos asignar la hora. Intentalo mas tarde.",
    });
  }
};
