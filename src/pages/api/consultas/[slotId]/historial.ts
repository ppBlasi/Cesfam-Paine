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
    return jsonResponse(403, { error: "No tienes permisos para ver el historial clínico." });
  }

  const url = new URL(request.url);
  const patientId = Number(url.searchParams.get("pacienteId"));

  if (!Number.isInteger(patientId) || patientId <= 0) {
    return jsonResponse(400, { error: "Identificador de paciente inválido." });
  }

  try {
    const entries = await prisma.consultaMedicaSlot.findMany({
      where: { id_paciente: patientId },
      orderBy: { created_at: "desc" },
      take: 10,
      select: {
        id_consulta: true,
        resumen: true,
        derivacion: true,
        diagnostico: true,
        tratamiento: true,
        orden_examenes: true,
        created_at: true,
        disponibilidad: {
          select: {
            trabajador: {
              select: {
                id_trabajador: true,
                primer_nombre_trabajador: true,
                segundo_nombre_trabajador: true,
                apellido_p_trabajador: true,
                apellido_m_trabajador: true,
              },
            },
          },
        },
      },
    });

    const normalized = entries.map((entry) => ({
      ...entry,
      doctor_id: entry.disponibilidad?.trabajador?.id_trabajador ?? null,
      doctor_full_name: entry.disponibilidad?.trabajador
        ? [
            entry.disponibilidad.trabajador.primer_nombre_trabajador,
            entry.disponibilidad.trabajador.segundo_nombre_trabajador,
            entry.disponibilidad.trabajador.apellido_p_trabajador,
            entry.disponibilidad.trabajador.apellido_m_trabajador,
          ]
            .filter(Boolean)
            .join(" ")
        : null,
    }));

    return jsonResponse(200, { entries: normalized });
  } catch (error: any) {
    console.error("historial consultas error", error);
    const missingTable =
      error?.code === "P2021" &&
      typeof error?.message === "string" &&
      error.message.toLowerCase().includes("table");
    const missingColumn =
      error?.code === "P2022" &&
      typeof error?.meta?.column === "string" &&
      error.meta.column.toLowerCase().includes("consulta_medica_slot");

    const message = missingTable
      ? "Falta crear la tabla consulta_medica_slot en la base de datos. Ejecuta la migración en tu DB y vuelve a intentar."
      : missingColumn
        ? "Faltan columnas (por ejemplo, diagnostico/tratamiento/orden_examenes) en consulta_medica_slot. Ejecuta la migración de Prisma en tu DB y vuelve a intentar."
        : "No pudimos recuperar el historial. Intenta nuevamente.";

    return jsonResponse(500, {
      error: message,
      debug:
        process.env.NODE_ENV !== "production"
          ? {
              code: error?.code,
              message: String(error?.message ?? ""),
              column: (error as any)?.meta?.column,
            }
          : undefined,
    });
  }
};
