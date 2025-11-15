export const prerender = false;
export const runtime = "nodejs";

import type { APIRoute } from "astro";
import { prisma } from "../../../lib/prisma";
import { SESSION_COOKIE_NAME, getSessionFromToken } from "../../../utils/session";
import { getWorkerByRut } from "../../../utils/admin";

const jsonResponse = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const ensureReceptionSession = async (cookies: APIRoute["context"]["cookies"]) => {
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

  if (!worker || worker.especialidad?.nombre_especialidad !== "Recepcion") {
    return null;
  }

  return worker;
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const worker = await ensureReceptionSession(cookies);

  if (!worker) {
    return jsonResponse(403, { error: "Debes iniciar sesion como recepcion para eliminar reservas." });
  }

  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return jsonResponse(400, { error: "Solicitud invalida." });
  }

  const disponibilidadId = Number((payload as Record<string, unknown>).disponibilidadId);

  if (!Number.isInteger(disponibilidadId) || disponibilidadId <= 0) {
    return jsonResponse(400, { error: "Reserva invalida." });
  }

  try {
    const slot = await prisma.disponibilidadTrabajador.findUnique({
      where: { id_disponibilidad: disponibilidadId },
      select: {
        estado: true,
        fecha: true,
      },
    });

    if (!slot || slot.estado === "disponible") {
      return jsonResponse(404, {
        error: "La reserva indicada no existe o ya fue liberada.",
      });
    }

    await prisma.disponibilidadTrabajador.update({
      where: { id_disponibilidad: disponibilidadId },
      data: {
        estado: "disponible",
        id_paciente: null,
        nota: null,
      },
    });

    return jsonResponse(200, { message: "Reserva eliminada. El horario vuelve a estar disponible." });
  } catch (error) {
    console.error("reception delete error", error);
    return jsonResponse(500, {
      error: "No pudimos eliminar la reserva. Intentalo nuevamente.",
    });
  }
};
