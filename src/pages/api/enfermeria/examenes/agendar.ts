export const prerender = false;
export const runtime = "nodejs";

import type { APIRoute, AstroCookies } from "astro";
import { prisma } from "../../../../lib/prisma";
import { SESSION_COOKIE_NAME, getSessionFromToken } from "../../../../utils/session";
import { getWorkerByRut } from "../../../../utils/admin";

const jsonResponse = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const ensureNurseSession = async (cookies: AstroCookies) => {
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

  if (
    !worker ||
    (worker.cargo !== "TENS" &&
      (worker.cargo !== "MEDICO" ||
        worker.especialidad?.nombre_especialidad !== "Enfermeria"))
  ) {
    return null;
  }

  return { workerId: worker.id_trabajador, rut: session.usuario.rut };
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const nurse = await ensureNurseSession(cookies);

  if (!nurse) {
    return jsonResponse(403, { error: "Debes iniciar sesion como enfermeria para agendar." });
  }

  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return jsonResponse(400, { error: "Solicitud invalida." });
  }

  const data = payload as Record<string, unknown>;
  const orderIdRaw = data.examOrderId ?? data.id;
  const availabilityIdRaw = data.availabilityId ?? data.disponibilidadId;

  let orderId: bigint;
  try {
    orderId = BigInt(
      typeof orderIdRaw === "string" || typeof orderIdRaw === "number" ? orderIdRaw : "",
    );
  } catch {
    return jsonResponse(400, { error: "Orden invalida." });
  }

  const availabilityId =
    typeof availabilityIdRaw === "number" || (typeof availabilityIdRaw === "string" && availabilityIdRaw.trim())
      ? Number(availabilityIdRaw)
      : null;

  if (!availabilityId || !Number.isInteger(availabilityId) || availabilityId <= 0) {
    return jsonResponse(400, { error: "Selecciona una hora disponible de enfermeria." });
  }

  const order = await prisma.examOrder.findUnique({
    where: { id: orderId },
    select: { id: true, estado: true, paciente_id: true },
  });

  if (!order) {
    return jsonResponse(404, { error: "No encontramos la orden de examen." });
  }

  if (order.estado === "REALIZADO") {
    return jsonResponse(400, { error: "La orden ya fue realizada." });
  }

  try {
    const availability = await prisma.disponibilidadTrabajador.findFirst({
      where: {
        id_disponibilidad: availabilityId,
        id_trabajador: nurse.workerId,
        estado: "disponible",
      },
      select: { id_disponibilidad: true, fecha: true },
    });

    if (!availability) {
      return jsonResponse(404, { error: "La hora seleccionada no esta disponible." });
    }

    await prisma.examOrder.update({
      where: { id: orderId },
      data: {
        estado: "AGENDADO",
        scheduled_at: availability.fecha,
        nurse_id: nurse.workerId,
        updated_at: new Date(),
      },
    });

    await prisma.disponibilidadTrabajador.update({
      where: { id_disponibilidad: availability.id_disponibilidad },
      data: {
        estado: "reservado",
        id_paciente: order.paciente_id,
        nota: "Reservado para examen",
      },
    });

    return jsonResponse(200, { message: "Orden agendada correctamente." });
  } catch (error) {
    console.error("exam order schedule error", error);
    return jsonResponse(500, { error: "No pudimos agendar el examen." });
  }
};
