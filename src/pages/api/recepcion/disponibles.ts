export const prerender = false;
export const runtime = "nodejs";

import type { APIRoute } from "astro";
import { prisma } from "../../../lib/prisma";
import { SESSION_COOKIE_NAME, getSessionFromToken } from "../../../utils/session";
import { getWorkerByRut, ADMIN_CARGO } from "../../../utils/admin";

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
  const dateParam = url.searchParams.get("date");

  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return jsonResponse(400, { error: "Debes seleccionar una fecha valida (YYYY-MM-DD)." });
  }

  const date = new Date(`${dateParam}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return jsonResponse(400, { error: "La fecha indicada no es valida." });
  }

  const from = startOfDay(date);
  const to = addDays(from, 1);

  const slots = await prisma.disponibilidadTrabajador.findMany({
    where: {
      estado: "disponible",
      fecha: {
        gte: from,
        lt: to,
      },
      trabajador: {
        estado_trabajador: "Activo",
        cargo: "MEDICO",
        id_especialidad: { not: null },
      },
    },
    orderBy: { fecha: "asc" },
    include: {
      trabajador: {
        select: {
          primer_nombre_trabajador: true,
          segundo_nombre_trabajador: true,
          apellido_p_trabajador: true,
          apellido_m_trabajador: true,
          especialidad: { select: { nombre_especialidad: true } },
        },
      },
    },
  });

  const formattedSlots = slots.map((slot) => ({
    id: slot.id_disponibilidad,
    time: slot.fecha.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }),
    doctor: [
      slot.trabajador.primer_nombre_trabajador,
      slot.trabajador.segundo_nombre_trabajador,
      slot.trabajador.apellido_p_trabajador,
      slot.trabajador.apellido_m_trabajador,
    ]
      .filter(Boolean)
      .join(" "),
    specialty: slot.trabajador.especialidad?.nombre_especialidad ?? "Medicina General",
  }));

  return jsonResponse(200, {
    date: dateParam,
    slots: formattedSlots,
  });
};
