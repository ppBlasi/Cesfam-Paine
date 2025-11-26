export const prerender = false;
export const runtime = "nodejs";

import type { APIRoute } from "astro";
import { prisma } from "../../../lib/prisma";
import { SESSION_COOKIE_NAME, getSessionFromToken } from "../../../utils/session";
import { getWorkerByRut, ADMIN_CARGO, GENERAL_SPECIALTY_NAME } from "../../../utils/admin";

const jsonResponse = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const startOfDay = (value: Date) => {
  const copy = new Date(value);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const addDays = (value: Date, days: number) => {
  const copy = new Date(value);
  copy.setDate(copy.getDate() + days);
  return copy;
};

const formatDateKey = (value: Date) => value.toISOString().split("T")[0];

const parseISODate = (value: string | null) => {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const ensureReceptionSession = async (cookies: APIRoute["context"]["cookies"]) => {
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

export const GET: APIRoute = async ({ request, cookies }) => {
  const worker = await ensureReceptionSession(cookies);

  if (!worker) {
    return jsonResponse(403, { error: "Debes iniciar sesion como recepcion para ver la agenda." });
  }

  const url = new URL(request.url);
  const specialtyParam = url.searchParams.get("specialty")?.trim() || GENERAL_SPECIALTY_NAME;
  const fromParam = parseISODate(url.searchParams.get("from"));
  const toParam = parseISODate(url.searchParams.get("to"));

  const today = startOfDay(new Date());
  const fromDate = fromParam && fromParam > today ? fromParam : today;
  const defaultTo = addDays(fromDate, 30);
  const maxTo = addDays(fromDate, 60);
  let toDate = toParam && toParam > fromDate ? toParam : defaultTo;
  if (toDate > maxTo) {
    toDate = maxTo;
  }

  const slots = await prisma.disponibilidadTrabajador.findMany({
    where: {
      estado: "disponible",
      fecha: {
        gte: fromDate,
        lt: addDays(toDate, 1),
      },
      trabajador: {
        estado_trabajador: "Activo",
        cargo: "MEDICO",
        id_especialidad: { not: null },
        especialidad: {
          nombre_especialidad: specialtyParam,
        },
      },
    },
    select: { fecha: true },
  });

  const dates = Array.from(
    slots
      .reduce((set, slot) => set.add(formatDateKey(slot.fecha)), new Set<string>())
  ).sort();

  return jsonResponse(200, {
    dates,
    range: { from: formatDateKey(fromDate), to: formatDateKey(toDate) },
  });
};
