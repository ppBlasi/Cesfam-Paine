export const prerender = false;
export const runtime = "nodejs";

import type { APIRoute } from "astro";
import { prisma } from "../../../lib/prisma";
import { getSessionFromToken, SESSION_COOKIE_NAME } from "../../../utils/session";
import { isAdminByRut } from "../../../utils/admin";

const jsonResponse = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const PUT: APIRoute = async ({ request, cookies }) => {
  const token = cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return jsonResponse(401, { error: "No autorizado." });
  }

  const session = await getSessionFromToken(token);
  if (!session) {
    cookies.delete(SESSION_COOKIE_NAME, { path: "/" });
    return jsonResponse(401, { error: "Sesion invalida." });
  }

  const isAdmin = await isAdminByRut(session.usuario.rut);
  if (!isAdmin) {
    return jsonResponse(403, { error: "Requiere permisos de administrador." });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return jsonResponse(400, { error: "Solicitud invalida." });
  }

  // Asegura columnas en caso de tablas antiguas
  await prisma.$executeRawUnsafe(`ALTER TABLE consulta_medica_slot ADD COLUMN IF NOT EXISTS tratamiento JSONB;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE consulta_medica_slot ADD COLUMN IF NOT EXISTS orden_examenes TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE consulta_medica_slot ADD COLUMN IF NOT EXISTS derivacion TEXT;`);

  const consultaId = Number((payload as Record<string, unknown>).consultaId);
  const resumen = String((payload as Record<string, unknown>).resumen ?? "").trim();
  const derivacion = String((payload as Record<string, unknown>).derivacion ?? "").trim();
  const tratamientoRaw = (payload as Record<string, unknown>).tratamiento;
  const ordenExamenes = String((payload as Record<string, unknown>).ordenExamenes ?? "").trim();

  if (!Number.isInteger(consultaId) || consultaId <= 0) {
    return jsonResponse(400, { error: "Identificador de consulta invalido." });
  }

  if (!resumen) {
    return jsonResponse(400, { error: "El resumen no puede estar vacio." });
  }

  let tratamiento: unknown = tratamientoRaw ?? null;
  if (typeof tratamientoRaw === "string") {
    const trimmed = tratamientoRaw.trim();
    if (!trimmed) {
      tratamiento = null;
    } else {
      try {
        tratamiento = JSON.parse(trimmed);
      } catch {
        tratamiento = trimmed; // Guardar texto plano si no es JSON válido
      }
    }
  }

  try {
    const updated = await prisma.$executeRaw`
      UPDATE consulta_medica_slot
      SET
        resumen = ${resumen},
        derivacion = ${derivacion || null},
        tratamiento = ${tratamiento as any},
        orden_examenes = ${ordenExamenes || null},
        updated_at = NOW()
      WHERE id_consulta = ${consultaId}
    `;

    if (typeof updated === "number" && updated === 0) {
      return jsonResponse(404, { error: "Consulta no encontrada." });
    }

    return jsonResponse(200, { message: "Consulta actualizada correctamente." });
  } catch (error) {
    console.error("admin update consulta error", error);
    return jsonResponse(500, { error: "No pudimos actualizar la consulta." });
  }
};
