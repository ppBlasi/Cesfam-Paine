export const prerender = false;
export const runtime = "nodejs";

import type { APIRoute, AstroCookies } from "astro";
import { prisma } from "../../../../lib/prisma";
import { SESSION_COOKIE_NAME, getSessionFromToken } from "../../../../utils/session";
import { GENERAL_SPECIALTY_NAME, getWorkerByRut } from "../../../../utils/admin";

const jsonResponse = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const ensureDoctorSession = async (cookies: AstroCookies) => {
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
    return jsonResponse(403, { error: "No tienes permisos para revisar antecedentes." });
  }

  const url = new URL(request.url);
  const patientId = Number(url.searchParams.get("pacienteId"));

  if (!Number.isInteger(patientId) || patientId <= 0) {
    return jsonResponse(400, { error: "Identificador de paciente inválido." });
  }

  let conditions: string[] = [];

  if (worker.especialidad?.id_especialidad) {
    if (worker.especialidad.nombre_especialidad === GENERAL_SPECIALTY_NAME) {
      await prisma.enfermedadEspecialidad.createMany({
        data: [
          { nombre_enfermedad: "Hipertensión arterial", id_especialidad: worker.especialidad.id_especialidad },
          { nombre_enfermedad: "Diabetes mellitus tipo 2", id_especialidad: worker.especialidad.id_especialidad },
          { nombre_enfermedad: "Dislipidemia mixta", id_especialidad: worker.especialidad.id_especialidad },
        ],
        skipDuplicates: true,
      });
    }

    const rows = await prisma.enfermedadEspecialidad.findMany({
      where: { id_especialidad: worker.especialidad.id_especialidad },
      orderBy: { nombre_enfermedad: "asc" },
      take: 3,
      select: { nombre_enfermedad: true },
    });

    conditions = rows.map((row) => row.nombre_enfermedad).filter(Boolean);
  }

  return jsonResponse(200, {
    chronic: false,
    conditions,
    treatments: [] as string[],
    medications: [] as string[],
    exams: [] as string[],
  });
};
