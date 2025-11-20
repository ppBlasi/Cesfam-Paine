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
  if (!worker) {
    return null;
  }

  return worker;
};

export const GET: APIRoute = async ({ request, cookies }) => {
  const worker = await ensureDoctorSession(cookies);

  if (!worker) {
    return jsonResponse(403, { error: "No tienes permisos para ver el historial clínico." });
  }

  const url = new URL(request.url);
  const patientId = Number(url.searchParams.get("pacienteId"));

  if (!Number.isInteger(patientId) || patientId <= 0) {
    return jsonResponse(400, { error: "Identificador de paciente inválido." });
  }

  await ensureConsultTable();

  const entries = await prisma.$queryRaw<
    Array<{
      id_consulta: number;
      resumen: string;
      derivacion: string | null;
      tratamiento: unknown;
      orden_examenes: string | null;
      created_at: Date;
    }>
  >`
    SELECT id_consulta, resumen, derivacion, tratamiento, orden_examenes, created_at
    FROM consulta_medica_slot
    WHERE id_paciente = ${patientId}
    ORDER BY created_at DESC
    LIMIT 10
  `;

  return jsonResponse(200, { entries });
};
