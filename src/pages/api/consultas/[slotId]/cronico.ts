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
    return jsonResponse(400, { error: "Identificador de paciente invalido." });
  }

  const conditionsSet = new Set<string>();
  const consultas = await prisma.consultaMedicaSlot.findMany({
    where: { id_paciente: patientId, diagnostico: { not: null } },
    orderBy: [{ updated_at: "desc" }, { created_at: "desc" }],
    take: 10,
    select: { diagnostico: true },
  });

  for (const consulta of consultas) {
    const diag = consulta.diagnostico ?? "";
    const marker = "Enfermedades:";
    const idx = diag.indexOf(marker);
    if (idx >= 0) {
      const list = diag
        .slice(idx + marker.length)
        .split(/[,|]/)
        .map((item) => item.trim())
        .filter(Boolean);
      list.forEach((item) => conditionsSet.add(item));
    }
  }

  const conditions = Array.from(conditionsSet);

  const examOrders = await prisma.examOrder.findMany({
    where: { paciente_id: patientId },
    orderBy: [{ updated_at: "desc" }],
    take: 5,
    select: {
      nombre_examen: true,
      estado: true,
      resultado_url: true,
      updated_at: true,
    },
  });

  const examSummaries = examOrders.map((exam) => {
    const status = exam.estado ?? "Pendiente";
    const hasResult = exam.resultado_url ? "con resultado" : "sin resultado";
    const updatedAt = exam.updated_at
      ? new Date(exam.updated_at).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" })
      : "Sin fecha";
    return `${exam.nombre_examen} · ${status} · ${hasResult} · ${updatedAt}`;
  });

  return jsonResponse(200, {
    chronic: false,
    conditions,
    treatments: [] as string[],
    medications: [] as string[],
    exams: examSummaries,
  });
};
