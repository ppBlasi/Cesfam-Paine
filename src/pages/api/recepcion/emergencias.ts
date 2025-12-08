export const prerender = false;
export const runtime = "nodejs";

import type { APIRoute, AstroCookies } from "astro";
import { prisma } from "../../../lib/prisma";
import { SESSION_COOKIE_NAME, getSessionFromToken } from "../../../utils/session";
import { getWorkerByRut, ADMIN_CARGO } from "../../../utils/admin";
import { normalizeRut } from "../../../utils/rut";

const jsonResponse = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const ensureReceptionSession = async (cookies: AstroCookies) => {
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

  if (!worker || (worker.cargo !== "RECEPCION" && worker.cargo !== ADMIN_CARGO)) {
    return null;
  }

  return worker;
};

const isValidSex = (value: string) => ["Femenino", "Masculino", "Otro"].includes(value);

export const POST: APIRoute = async ({ request, cookies }) => {
  const worker = await ensureReceptionSession(cookies);

  if (!worker) {
    return jsonResponse(403, {
      error: "Debes iniciar sesion como recepcion para registrar una emergencia.",
    });
  }

  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return jsonResponse(400, { error: "Solicitud invalida." });
  }

  const data = payload as Record<string, unknown>;
  const fullName = String(data.fullName ?? "").trim();
  const rutRaw = String(data.rut ?? "").trim();
  const phone = String(data.phone ?? "").trim();
  const age = Number(data.age);
  const birthdateRaw = String(data.birthdate ?? "").trim();
  const sex = String(data.sex ?? "").trim();
  const address = String(data.address ?? "").trim();

  if (!fullName || !rutRaw || !phone || !birthdateRaw || !sex || !address) {
    return jsonResponse(400, { error: "Completa todos los campos obligatorios." });
  }

  const rut = normalizeRut(rutRaw);

  if (!rut) {
    return jsonResponse(400, { error: "El RUT ingresado no es valido." });
  }

  if (!Number.isInteger(age) || age < 0 || age > 130) {
    return jsonResponse(400, { error: "La edad ingresada no es valida." });
  }

  const birthdate = new Date(birthdateRaw);

  if (Number.isNaN(birthdate.getTime())) {
    return jsonResponse(400, { error: "La fecha de nacimiento no es valida." });
  }

  if (!isValidSex(sex)) {
    return jsonResponse(400, { error: "Selecciona un valor de sexo valido." });
  }

  try {
    const record = await prisma.emergencia.create({
      data: {
        fullName,
        rut,
        phone,
        age,
        birthdate,
        sex,
        address,
      },
      select: {
        id: true,
        createdAt: true,
      },
    });

    return jsonResponse(201, {
      message: "Emergencia registrada correctamente.",
      id: record.id,
      createdAt: record.createdAt,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse(500, { error: "No pudimos guardar la emergencia. Intenta nuevamente." });
  }
};
