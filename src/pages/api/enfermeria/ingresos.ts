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

const ensureNurseSession = async (cookies: APIRoute["context"]["cookies"]) => {
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

  if (!worker || worker.especialidad?.nombre_especialidad !== "Enfermeria") {
    return null;
  }

  return { workerId: worker.id_trabajador, rut: session.usuario.rut };
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const nurse = await ensureNurseSession(cookies);

  if (!nurse) {
    return jsonResponse(403, { error: "Debes iniciar sesion como enfermeria para registrar ingresos." });
  }

  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return jsonResponse(400, { error: "Solicitud invalida." });
  }

  const disponibilidadIdRaw = (payload as Record<string, unknown>).disponibilidadId;
  const alturaRaw = (payload as Record<string, unknown>).altura;
  const pesoRaw = (payload as Record<string, unknown>).peso;
  const signosRaw = (payload as Record<string, unknown>).signosVitales;

  const disponibilidadId = Number(disponibilidadIdRaw);
  const altura = Number(alturaRaw);
  const peso = Number(pesoRaw);
  const signosVitales = typeof signosRaw === "string" ? signosRaw.trim() : "";

  if (!Number.isInteger(disponibilidadId) || disponibilidadId <= 0) {
    return jsonResponse(400, { error: "Reserva invalida." });
  }

  if (!Number.isFinite(altura) || altura <= 0 || altura > 250) {
    return jsonResponse(400, { error: "Ingresa una altura valida en centimetros." });
  }

  if (!Number.isFinite(peso) || peso <= 0 || peso > 400) {
    return jsonResponse(400, { error: "Ingresa un peso valido en kilogramos." });
  }

  if (!signosVitales) {
    return jsonResponse(400, { error: "Debes indicar los signos vitales observados." });
  }

  const availability = await prisma.disponibilidadTrabajador.findUnique({
    where: { id_disponibilidad: disponibilidadId },
    include: {
      paciente: {
        select: {
          id_paciente: true,
        },
      },
    },
  });

  if (!availability || !availability.paciente) {
    return jsonResponse(404, {
      error: "No encontramos la reserva asociada o no tiene paciente asignado.",
    });
  }

  try {
    const record = await prisma.ingresoEnfermeria.upsert({
      where: { id_disponibilidad: disponibilidadId },
      update: {
        altura,
        peso,
        signos_vitales: signosVitales,
      },
      create: {
        id_disponibilidad: disponibilidadId,
        id_paciente: availability.paciente.id_paciente,
        altura,
        peso,
        signos_vitales: signosVitales,
      },
      select: {
        id_ingreso: true,
        altura: true,
        peso: true,
        signos_vitales: true,
        updated_at: true,
      },
    });

    return jsonResponse(200, {
      message: "Ingreso registrado correctamente.",
      record,
    });
  } catch (error) {
    console.error("nurse intake error", error);
    return jsonResponse(500, {
      error: "No pudimos registrar el ingreso de enfermeria. Intentalo nuevamente.",
    });
  }
};
