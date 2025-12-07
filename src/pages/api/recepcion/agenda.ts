export const prerender = false;
export const runtime = "nodejs";

import type { APIRoute, AstroCookies } from "astro";
import { prisma } from "../../../lib/prisma";
import { ADMIN_CARGO, GENERAL_SPECIALTY_NAME, getWorkerByRut } from "../../../utils/admin";
import { normalizeRut } from "../../../utils/rut";
import { SESSION_COOKIE_NAME, getSessionFromToken } from "../../../utils/session";

const jsonResponse = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const parseISODate = (value: string | null) => {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

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

const formatTime = (value: Date) =>
  value.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

const humanizeDate = (value: Date) =>
  value.toLocaleDateString("es-CL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

const getAllowedSpecialties = async (patientId: number | null) => {
  const allowed = new Set<string>([GENERAL_SPECIALTY_NAME]);
  let preferredSpecialty: string | null = null;
  if (!patientId) return { allowed, preferredSpecialty };

  const derivaciones = await prisma.consultaMedicaSlot.findMany({
    where: {
      id_paciente: patientId,
      derivacion: { not: null },
    },
    select: { derivacion: true, created_at: true, id_consulta: true },
    orderBy: [
      { created_at: "desc" },
      { id_consulta: "desc" },
    ],
  });

  for (const item of derivaciones) {
    const name = item.derivacion?.trim();
    if (name) {
      allowed.add(name);
      if (!preferredSpecialty) {
        preferredSpecialty = name;
      }
    }
  }

  return { allowed, preferredSpecialty };
};

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

export const GET: APIRoute = async ({ request, cookies }) => {
  const worker = await ensureReceptionSession(cookies);

  if (!worker) {
    return jsonResponse(403, { error: "Debes iniciar sesion como recepcion para ver las horas disponibles." });
  }

  const url = new URL(request.url);
  const rutParam = url.searchParams.get("rut")?.trim() ?? "";
  const specialtyParamRaw = url.searchParams.get("specialty");
  const specialtyParam = specialtyParamRaw?.trim() ?? "";
  const hasSpecialtyParam = url.searchParams.has("specialty") && Boolean(specialtyParam);
  const fromParam = parseISODate(url.searchParams.get("from"));
  const toParam = parseISODate(url.searchParams.get("to"));

  if (!rutParam) {
    return jsonResponse(400, { error: "Debes indicar el RUT del paciente." });
  }

  const normalizedRut = normalizeRut(rutParam);

  if (!normalizedRut) {
    return jsonResponse(400, { error: "El RUT ingresado no es valido." });
  }

  const patient = await prisma.paciente.findFirst({
    where: { rut_paciente: normalizedRut },
    select: { id_paciente: true },
  });

  if (!patient) {
    return jsonResponse(404, { error: "No encontramos un paciente con ese RUT." });
  }

  const today = startOfDay(new Date());
  const defaultTo = addDays(today, 14);
  const fromDate = fromParam && fromParam > today ? fromParam : today;
  let toDate = toParam && toParam > fromDate ? toParam : defaultTo;
  const maxRangeEnd = addDays(fromDate, 30);
  if (toDate > maxRangeEnd) {
    toDate = maxRangeEnd;
  }

  const { allowed: allowedSpecialtiesSet, preferredSpecialty } = await getAllowedSpecialties(patient.id_paciente);
  const allowedSpecialties = Array.from(allowedSpecialtiesSet);
  const allowedNormalized = new Set(allowedSpecialties.map((name) => name.toLowerCase()));
  const requestedSpecialty =
    hasSpecialtyParam && allowedNormalized.has(specialtyParam.toLowerCase()) && specialtyParam
      ? specialtyParam
      : null;

  const now = new Date();

  const rawSlots = await prisma.disponibilidadTrabajador.findMany({
    where: {
      estado: "disponible",
      fecha: {
        gte: fromDate,
        lte: toDate,
      },
      trabajador: {
        estado_trabajador: "Activo",
        especialidad: {
          nombre_especialidad: {
            in: allowedSpecialties,
          },
        },
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
          especialidad: {
            select: { nombre_especialidad: true },
          },
        },
      },
    },
  });

  const specialtiesSet = new Set<string>([GENERAL_SPECIALTY_NAME]);
  for (const slot of rawSlots) {
    const name = slot.trabajador.especialidad?.nombre_especialidad?.trim();
    if (name) specialtiesSet.add(name);
  }
  // Include allowed specialties so derivations appear even if there is no disponibilidad yet.
  for (const allowed of allowedSpecialties) {
    const clean = allowed?.trim();
    if (clean) {
      specialtiesSet.add(clean);
    }
  }

  const specialtiesList = Array.from(specialtiesSet);
  const normalizedSpecialties = new Set(specialtiesList.map((name) => name.toLowerCase()));
  const preferredFromAvailability =
    preferredSpecialty &&
    specialtiesList.some((name) => name.toLowerCase() === preferredSpecialty.toLowerCase())
      ? preferredSpecialty
      : null;
  const resolvedSpecialty =
    (requestedSpecialty && normalizedSpecialties.has(requestedSpecialty.toLowerCase()) && requestedSpecialty) ||
    preferredFromAvailability ||
    (specialtiesList.find((name) => allowedNormalized.has(name.toLowerCase())) ?? GENERAL_SPECIALTY_NAME);
  const normalizedResolved = resolvedSpecialty.toLowerCase();

  const existingBooking = await prisma.disponibilidadTrabajador.findFirst({
    where: {
      id_paciente: patient.id_paciente,
      estado: "reservado",
      fecha: { gte: now },
      trabajador: {
        especialidad: { nombre_especialidad: resolvedSpecialty },
      },
    },
    orderBy: { fecha: "asc" },
    select: {
      id_disponibilidad: true,
      fecha: true,
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

  const slots = rawSlots.filter((slot) => {
    const slotSpecialty = slot.trabajador.especialidad?.nombre_especialidad ?? GENERAL_SPECIALTY_NAME;
    return slotSpecialty.toLowerCase() === normalizedResolved;
  });

  const grouped = new Map<
    string,
    {
      date: Date;
      slots: Map<
        string,
        Array<{
          disponibilidadId: number;
          doctorId: number;
          doctorName: string;
          specialty: string;
          timestamp: Date;
        }>
      >;
    }
  >();

  for (const slot of slots) {
    if (slot.fecha < now) {
      continue;
    }
    const slotDate = startOfDay(slot.fecha);
    const dateKey = formatDateKey(slotDate);
    const timeKey = formatTime(slot.fecha);
    const doctorName = [
      slot.trabajador.primer_nombre_trabajador,
      slot.trabajador.segundo_nombre_trabajador,
      slot.trabajador.apellido_p_trabajador,
      slot.trabajador.apellido_m_trabajador,
    ]
      .filter(Boolean)
      .join(" ");

    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, {
        date: slotDate,
        slots: new Map(),
      });
    }

    const dayGroup = grouped.get(dateKey)!;

    if (!dayGroup.slots.has(timeKey)) {
      dayGroup.slots.set(timeKey, []);
    }

    dayGroup.slots.get(timeKey)!.push({
      disponibilidadId: slot.id_disponibilidad,
      doctorId: slot.trabajador.id_trabajador,
      doctorName,
      specialty: slot.trabajador.especialidad?.nombre_especialidad ?? GENERAL_SPECIALTY_NAME,
      timestamp: slot.fecha,
    });
  }

  const days = Array.from(grouped.entries())
    .map(([dateKey, dayGroup]) => ({
      date: dateKey,
      displayDate: humanizeDate(dayGroup.date),
      slots: Array.from(dayGroup.slots.entries())
        .map(([time, entries]) => ({
          time,
          available: entries.length,
          entries: entries.map((entry) => ({
            disponibilidadId: entry.disponibilidadId,
            doctorId: entry.doctorId,
            doctorName: entry.doctorName,
            specialty: entry.specialty,
            timestamp: entry.timestamp.toISOString(),
          })),
        }))
        .sort((a, b) => a.time.localeCompare(b.time)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return jsonResponse(200, {
    range: {
      from: formatDateKey(fromDate),
      to: formatDateKey(toDate),
    },
    specialties: specialtiesList,
    selectedSpecialty: resolvedSpecialty,
    totalSlots: slots.length,
    days,
    existingBooking: existingBooking
      ? {
          disponibilidadId: existingBooking.id_disponibilidad,
          fecha: existingBooking.fecha.toISOString(),
          doctor: [
            existingBooking.trabajador?.primer_nombre_trabajador,
            existingBooking.trabajador?.segundo_nombre_trabajador,
            existingBooking.trabajador?.apellido_p_trabajador,
            existingBooking.trabajador?.apellido_m_trabajador,
          ]
            .filter(Boolean)
            .join(" "),
          specialty: existingBooking.trabajador?.especialidad?.nombre_especialidad ?? GENERAL_SPECIALTY_NAME,
        }
      : null,
  });
};
