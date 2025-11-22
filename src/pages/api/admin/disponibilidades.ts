export const prerender = false;
export const runtime = "nodejs";

import type { APIRoute } from "astro";
import { prisma } from "../../../lib/prisma";
import {
  SESSION_COOKIE_NAME,
  getSessionFromToken,
} from "../../../utils/session";
import {
  ADMIN_CARGO,
  ADMIN_SPECIALTY_NAME,
  isAdminByRut,
} from "../../../utils/admin";

const jsonResponse = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const WORK_START_HOUR = 8;
const WEEKDAY_END_HOUR = 20;
const SATURDAY_END_HOUR = 13;
const SLOT_MINUTES = 30;
const MAX_RANGE_DAYS = 60;
const ALLOWED_DAYS = [1, 2, 3, 4, 5, 6]; // Monday-Saturday

const normalizeDaysOfWeek = (value: unknown) => {
  if (!Array.isArray(value)) {
    return ALLOWED_DAYS;
  }

  const parsed = value
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && ALLOWED_DAYS.includes(day));

  if (parsed.length === 0) {
    return ALLOWED_DAYS;
  }

  return Array.from(new Set(parsed));
};

const parseDateInput = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const diffInDays = (start: Date, end: Date) =>
  Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

const addDays = (date: Date, days: number) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

const buildSlotsForDate = (date: Date) => {
  const slots: Date[] = [];
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayOfWeek = dayStart.getDay();
  const endHour =
    dayOfWeek === 6 ? SATURDAY_END_HOUR : WEEKDAY_END_HOUR;
  const totalMinutes = endHour * 60;

  for (
    let minute = WORK_START_HOUR * 60;
    minute < totalMinutes;
    minute += SLOT_MINUTES
  ) {
    const slot = new Date(dayStart);
    slot.setMinutes(slot.getMinutes() + minute);
    slots.push(slot);
  }

  return slots;
};

const ensureAdminSession = async (cookies: any) => {
  const token = cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const session = await getSessionFromToken(token);

  if (!session) {
    cookies.delete(SESSION_COOKIE_NAME, { path: "/" });
    return null;
  }

  const isAdmin = await isAdminByRut(session.usuario.rut);
  return isAdmin ? session : null;
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = await ensureAdminSession(cookies);

  if (!session) {
    return jsonResponse(401, { error: "No autorizado." });
  }

  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return jsonResponse(400, { error: "Solicitud invalida." });
  }

  const trabajadorId = Number(
    (payload as Record<string, unknown>).trabajadorId,
  );
  const startDate = parseDateInput(
    (payload as Record<string, unknown>).startDate,
  );
  const endDate = parseDateInput((payload as Record<string, unknown>).endDate);
  const daysOfWeek = normalizeDaysOfWeek(
    (payload as Record<string, unknown>).daysOfWeek,
  );

  if (!Number.isInteger(trabajadorId) || trabajadorId <= 0) {
    return jsonResponse(400, { error: "Trabajador invalido." });
  }

  if (!startDate || !endDate) {
    return jsonResponse(400, { error: "Fechas invalidas." });
  }

  if (endDate < startDate) {
    return jsonResponse(400, {
      error: "La fecha final debe ser posterior a la inicial.",
    });
  }

  const rangeDays = diffInDays(startDate, endDate);

  if (rangeDays > MAX_RANGE_DAYS) {
    return jsonResponse(400, {
      error: `El rango no debe exceder ${MAX_RANGE_DAYS} dias.`,
    });
  }

  const worker = await prisma.trabajador.findUnique({
    where: { id_trabajador: trabajadorId },
    select: {
      id_trabajador: true,
      cargo: true,
      especialidad: {
        select: { nombre_especialidad: true },
      },
    },
  });

  if (!worker) {
    return jsonResponse(404, { error: "Trabajador no encontrado." });
  }

  if (
    worker.cargo === ADMIN_CARGO ||
    worker.especialidad?.nombre_especialidad === ADMIN_SPECIALTY_NAME ||
    worker.cargo !== "MEDICO"
  ) {
    return jsonResponse(400, {
      error: "Solo se pueden asignar horarios a medicos.",
    });
  }

  const slots: { id_trabajador: number; fecha: Date; estado: string }[] = [];
  const totalDays = diffInDays(startDate, endDate) + 1;

  for (let offset = 0; offset < totalDays; offset++) {
    const currentDate = addDays(startDate, offset);
    const currentDay = currentDate.getDay();
    if (!daysOfWeek.includes(currentDay)) {
      continue;
    }

    if (!ALLOWED_DAYS.includes(currentDay)) {
      continue;
    }

    const daySlots = buildSlotsForDate(currentDate);
    daySlots.forEach((slot) => {
      slots.push({
        id_trabajador: trabajadorId,
        fecha: slot,
        estado: "disponible",
      });
    });
  }

  if (slots.length === 0) {
    return jsonResponse(400, {
      error: "Los filtros seleccionados no generan horarios disponibles.",
    });
  }

  try {
    const result = await prisma.disponibilidadTrabajador.createMany({
      data: slots,
      skipDuplicates: true,
    });

    return jsonResponse(201, {
      message: `Se agregaron ${result.count} bloques de 30 minutos al trabajador.`,
      insertedSlots: result.count,
    });
  } catch (error) {
    console.error("create availability error", error);
    return jsonResponse(500, {
      error: "No pudimos asignar los horarios. Intenta mas tarde.",
    });
  }
};

export const GET: APIRoute = async ({ request, cookies }) => {
  const session = await ensureAdminSession(cookies);

  if (!session) {
    return jsonResponse(401, { error: "No autorizado." });
  }

  const url = new URL(request.url);
  const trabajadorParam = url.searchParams.get("trabajadorId");
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  const trabajadorId = trabajadorParam ? Number(trabajadorParam) : null;
  const fromDate =
    parseDateInput(fromParam) ?? (() => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return today;
    })();
  const toDate =
    parseDateInput(toParam) ??
    (() => {
      const future = new Date(fromDate);
      future.setDate(future.getDate() + 14);
      return future;
    })();

  const slots = await prisma.disponibilidadTrabajador.findMany({
    where: {
      ...(trabajadorId && Number.isInteger(trabajadorId) && trabajadorId > 0
        ? { id_trabajador: trabajadorId }
        : {}),
      fecha: { gte: fromDate, lte: toDate },
      trabajador: {
        cargo: "MEDICO",
        id_especialidad: { not: null },
      },
    },
    orderBy: { fecha: "asc" },
    include: {
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
  });

  return jsonResponse(
    200,
    slots.map((slot) => ({
      id: slot.id_disponibilidad,
      trabajadorId: slot.id_trabajador,
      fecha: slot.fecha,
      estado: slot.estado,
      trabajador: slot.trabajador,
    })),
  );
};

const parseSlotIds = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((slotId) => Number(slotId))
        .filter((slotId) => Number.isInteger(slotId) && slotId > 0)
    : [];

export const DELETE: APIRoute = async ({ request, cookies }) => {
  const session = await ensureAdminSession(cookies);

  if (!session) {
    return jsonResponse(401, { error: "No autorizado." });
  }

  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return jsonResponse(400, { error: "Solicitud invalida." });
  }

  const mode = String((payload as Record<string, unknown>).mode ?? "").toLowerCase();

  if (mode === "slot") {
    const slotIds = parseSlotIds((payload as Record<string, unknown>).slotIds);

    if (slotIds.length === 0) {
      return jsonResponse(400, { error: "Debes indicar al menos un bloque a eliminar." });
    }

    const trabajadorIdValue = (payload as Record<string, unknown>).trabajadorId;
    const trabajadorId = trabajadorIdValue ? Number(trabajadorIdValue) : null;
    const where = {
      id_disponibilidad: { in: slotIds },
      ...(trabajadorId && Number.isInteger(trabajadorId) && trabajadorId > 0
        ? { id_trabajador: trabajadorId }
        : {}),
    };

    const result = await prisma.disponibilidadTrabajador.deleteMany({ where });

    if (result.count === 0) {
      return jsonResponse(404, { error: "No encontramos bloques para eliminar." });
    }

    return jsonResponse(200, {
      message: `Se eliminaron ${result.count} bloque(s) de disponibilidad.`,
      removed: result.count,
    });
  }

  if (mode === "day") {
    const trabajadorId = Number((payload as Record<string, unknown>).trabajadorId);
    const date = parseDateInput((payload as Record<string, unknown>).date);

    if (!Number.isInteger(trabajadorId) || trabajadorId <= 0) {
      return jsonResponse(400, { error: "Trabajador invalido para eliminar el dia." });
    }

    if (!date) {
      return jsonResponse(400, { error: "Fecha invalida." });
    }

    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const nextDay = addDays(dayStart, 1);

    const result = await prisma.disponibilidadTrabajador.deleteMany({
      where: {
        id_trabajador: trabajadorId,
        fecha: {
          gte: dayStart,
          lt: nextDay,
        },
      },
    });

    if (result.count === 0) {
      return jsonResponse(404, { error: "No encontramos horarios para ese dia." });
    }

    return jsonResponse(200, {
      message: `Se eliminaron ${result.count} bloque(s) del dia seleccionado.`,
      removed: result.count,
    });
  }

  return jsonResponse(400, { error: "Modo de eliminacion no soportado." });
};
