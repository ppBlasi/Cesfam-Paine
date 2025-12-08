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

const VALID_STATES = new Set(["consciente", "inconsciente"]);

export const POST: APIRoute = async ({ request, cookies }) => {
  const nurse = await ensureNurseSession(cookies);

  if (!nurse) {
    return jsonResponse(403, {
      error: "Debes iniciar sesion como enfermeria para registrar la atencion.",
    });
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

  if (!VALID_STATES.has(estado)) {
    return jsonResponse(400, { error: "Selecciona un estado valido." });
  }

  if (!motivo && !signosVitales && !resumen) {
    return jsonResponse(400, {
      error: "Agrega al menos el motivo, los signos vitales o un resumen de la atencion.",
    });
  }

  const emergencyExists = await prisma.emergencia.findUnique({
    where: { id: emergencyId },
    select: { id: true },
  });

  if (!emergencyExists) {
    return jsonResponse(404, { error: "No encontramos la emergencia seleccionada." });
  }

  try {
    const result = await prisma.$queryRaw<
      { id: bigint; emergencia_id: bigint; updated_at: Date; finished_at: Date | null }[]
    >`
      insert into emergency_attentions (
        emergencia_id,
        box,
        estado,
        motivo,
        signos_vitales,
        alergias,
        resumen,
        doctor_id,
        nurse_id,
        finished_at,
        updated_at
      )
      values (
        ${emergencyId},
        ${box || null},
        ${estado || null},
        ${motivo || null},
        ${signosVitales || null},
        ${alergias || null},
        ${resumen || null},
        ${doctorId},
        ${nurse.workerId},
        now(),
        now()
      )
      on conflict (emergencia_id)
      do update set
        box = excluded.box,
        estado = excluded.estado,
        motivo = excluded.motivo,
        signos_vitales = excluded.signos_vitales,
        alergias = excluded.alergias,
        resumen = excluded.resumen,
        doctor_id = excluded.doctor_id,
        nurse_id = excluded.nurse_id,
        finished_at = now(),
        updated_at = now()
      returning id, emergencia_id, finished_at, updated_at;
    `;

    const row = result?.[0];

    return jsonResponse(200, {
      message: "Emergencia marcada como finalizada.",
      id: row?.id ? row.id.toString() : null,
      emergenciaId: row?.emergencia_id ? row.emergencia_id.toString() : emergencyId.toString(),
      finishedAt: row?.finished_at ?? null,
      updatedAt: row?.updated_at ?? null,
    });
  } catch (error) {
    console.error("emergency attention save error", error);
    return jsonResponse(500, {
      error: "No pudimos registrar la atencion. Intentalo nuevamente.",
    });
  }
};
