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

const VALID_STATES = new Set(["consciente", "inconsciente"]);

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

  const data = payload as Record<string, unknown>;

  const emergencyIdRaw = data.emergencyId ?? data.emergenciaId ?? data.id;
  const emergencyIdStr =
    typeof emergencyIdRaw === "string" || typeof emergencyIdRaw === "number"
      ? String(emergencyIdRaw)
      : "";

  let emergencyId: bigint;
  try {
    emergencyId = BigInt(emergencyIdStr);
  } catch {
    return jsonResponse(400, { error: "Emergencia invalida." });
  }

  if (emergencyId <= 0) {
    return jsonResponse(400, { error: "Emergencia invalida." });
  }

  const box = String(data.box ?? "").trim();
  const estado = String(data.estado ?? "").trim();
  const motivo = String(data.motivo ?? "").trim();
  const signosVitales = String(data.signosVitales ?? "").trim();
  const alergias = String(data.alergias ?? "").trim();
  const resumen = String(data.resumen ?? "").trim();

  const doctorIdRaw = data.doctorId;
  const doctorIdValue =
    typeof doctorIdRaw === "string" || typeof doctorIdRaw === "number"
      ? Number(doctorIdRaw)
      : null;
  const doctorId =
    doctorIdValue && Number.isInteger(doctorIdValue) && doctorIdValue > 0
      ? doctorIdValue
      : null;

  if (estado && !VALID_STATES.has(estado)) {
    return jsonResponse(400, { error: "Selecciona un estado valido." });
  }

  const attention = await prisma.emergencyAttention.findUnique({
    where: { emergencia_id: emergencyId },
    select: { id: true, finished_at: true },
  });

  if (!attention) {
    return jsonResponse(404, { error: "No encontramos la emergencia seleccionada." });
  }

  try {
    const now = new Date();

    await prisma.emergencyAttention.update({
      where: { emergencia_id: emergencyId },
      data: {
        box: box || null,
        estado: estado || null,
        motivo: motivo || null,
        signos_vitales: signosVitales || null,
        alergias: alergias || null,
        resumen: resumen || null,
        doctor_id: doctorId,
        finished_at: attention.finished_at ?? now,
        updated_at: now,
      },
    });

    return jsonResponse(200, { message: "Emergencia actualizada correctamente." });
  } catch (error) {
    console.error("admin emergency update error", error);
    return jsonResponse(500, { error: "No pudimos actualizar la emergencia." });
  }
};
