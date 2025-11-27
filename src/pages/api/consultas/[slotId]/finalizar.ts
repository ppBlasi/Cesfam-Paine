export const prerender = false;
export const runtime = "nodejs";

import type { APIRoute } from "astro";
import { prisma } from "../../../../lib/prisma";
import { SESSION_COOKIE_NAME, getSessionFromToken } from "../../../../utils/session";
import { getWorkerByRut } from "../../../../utils/admin";

const jsonResponse = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const ensureConsultTable = async () => {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS consulta_medica_slot (
      id_consulta SERIAL PRIMARY KEY,
      id_disponibilidad INTEGER NOT NULL UNIQUE REFERENCES disponibilidad_trabajador(id_disponibilidad),
      id_paciente INTEGER NOT NULL REFERENCES "Paciente"(id_paciente),
      resumen TEXT NOT NULL,
      derivacion TEXT,
      tratamiento JSONB,
      orden_examenes TEXT,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(
    `ALTER TABLE consulta_medica_slot ADD COLUMN IF NOT EXISTS tratamiento JSONB;`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE consulta_medica_slot ADD COLUMN IF NOT EXISTS orden_examenes TEXT;`
  );
};

const ensureDoctorSession = async (cookies: APIRoute["context"]["cookies"]) => {
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
  if (!worker || worker.cargo !== "MEDICO" || !worker.id_especialidad) {
    return null;
  }

  return worker;
};

export const POST: APIRoute = async ({ request, cookies, params }) => {
  const worker = await ensureDoctorSession(cookies);

  if (!worker) {
    return jsonResponse(403, { error: "No tienes permisos para guardar la consulta." });
  }

  const slotId = Number(params.slotId);
  if (!Number.isInteger(slotId) || slotId <= 0) {
    return jsonResponse(400, { error: "Reserva inválida." });
  }

  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return jsonResponse(400, { error: "Solicitud inválida." });
  }

  const patientId = Number((payload as Record<string, unknown>).patientId);
  const resumen = String((payload as Record<string, unknown>).resumen ?? "").trim();
  const derivacion = String((payload as Record<string, unknown>).derivacion ?? "").trim() || null;
  const tratamiento = Array.isArray((payload as Record<string, unknown>).tratamientos)
    ? (payload as Record<string, unknown>).tratamientos
    : [];
  const ordenExamenes = String((payload as Record<string, unknown>).ordenExamenes ?? "").trim() || null;

  if (!Number.isInteger(patientId) || patientId <= 0) {
    return jsonResponse(400, { error: "Paciente inválido." });
  }

  if (!resumen) {
    return jsonResponse(400, { error: "Debes ingresar el resumen de la consulta." });
  }

  const slot = await prisma.disponibilidadTrabajador.findFirst({
    where: { id_disponibilidad: slotId, id_trabajador: worker.id_trabajador },
    select: { id_paciente: true },
  });

  if (!slot || slot.id_paciente !== patientId) {
    return jsonResponse(404, { error: "No encontramos la reserva asociada al paciente." });
  }

  await ensureConsultTable();

  const tratamientoJson = JSON.stringify(tratamiento);

  await prisma.$executeRaw`
    INSERT INTO consulta_medica_slot (id_disponibilidad, id_paciente, resumen, derivacion, tratamiento, orden_examenes)
    VALUES (${slotId}, ${patientId}, ${resumen}, ${derivacion}, ${tratamientoJson}::jsonb, ${ordenExamenes})
    ON CONFLICT (id_disponibilidad)
    DO UPDATE SET
      resumen = EXCLUDED.resumen,
      derivacion = EXCLUDED.derivacion,
      tratamiento = EXCLUDED.tratamiento,
      orden_examenes = EXCLUDED.orden_examenes,
      updated_at = CURRENT_TIMESTAMP;
  `;

  await prisma.disponibilidadTrabajador.update({
    where: { id_disponibilidad: slotId },
    data: {
      estado: "finalizado",
    },
  });

  return jsonResponse(200, { message: "Consulta registrada correctamente." });
};
