export const prerender = false;
export const runtime = "nodejs";

import type { APIRoute } from "astro";
import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma";
import { normalizeRut } from "../../utils/rut";
import {
  SESSION_COOKIE_NAME,
  createUserSession,
  sessionCookieOptions,
} from "../../utils/session";
import {
  ADMIN_SPECIALTY_NAME,
  ADMIN_CARGO,
  getWorkerByRut,
} from "../../utils/admin";

const jsonResponse = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = (await request.json().catch(() => null)) as {
    rut?: string;
    password?: string;
  } | null;

  if (!body) {
    return jsonResponse(400, { error: "Solicitud invalida." });
  }

  const rut = body.rut?.trim() ?? "";
  const password = body.password ?? "";

  if (!rut || !password) {
    return jsonResponse(400, { error: "Debes ingresar tu RUT y contraseña." });
  }

  const normalizedRut = normalizeRut(rut);

  try {
    const user = await prisma.usuario.findUnique({ where: { rut: normalizedRut } });

    if (!user) {
      return jsonResponse(401, { error: "RUT o contraseña incorrectos." });
    }

    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      return jsonResponse(401, { error: "RUT o contraseña incorrectos." });
    }

    const workerRecord = await getWorkerByRut(normalizedRut);
    const isWorker = Boolean(workerRecord);
    const isAdmin =
      workerRecord?.cargo === ADMIN_CARGO ||
      workerRecord?.especialidad?.nombre_especialidad ===
        ADMIN_SPECIALTY_NAME;

    if (workerRecord && workerRecord.estado_trabajador !== "Activo") {
      return jsonResponse(403, {
        error:
          "Tu acceso como trabajador esta desactivado. Contacta al administrador para reactivar tu cuenta.",
      });
    }

    await prisma.session.deleteMany({ where: { user_id: user.id_usuario } });

    const { token, expiresAt } = await createUserSession(user.id_usuario);
    cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(expiresAt));

    return jsonResponse(200, {
      message: "Autenticacion exitosa.",
      redirect: isAdmin ? "/admin" : isWorker ? "/trabajador" : "/perfil",
      isAdmin,
      isWorker,
      specialty: workerRecord?.especialidad?.nombre_especialidad ?? null,
    });
  } catch (error) {
    console.error("login error", error);
    return jsonResponse(500, { error: "No pudimos iniciar tu sesion. Intentalo mas tarde." });
  }
};
