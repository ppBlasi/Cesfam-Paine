export const prerender = false;
export const runtime = "nodejs";

import type { APIRoute } from "astro";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "../../../lib/prisma";
import { normalizeRut } from "../../../utils/rut";
import {
  SESSION_COOKIE_NAME,
  getSessionFromToken,
} from "../../../utils/session";
import { getWorkerByRut, isAdminByRut } from "../../../utils/admin";

const jsonResponse = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const sanitizeString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const ALLOWED_CARGOS = ["ADMIN", "RECEPCION", "MEDICO"];
const isValidCargo = (cargo: string) => ALLOWED_CARGOS.includes(cargo);

export const POST: APIRoute = async ({ request, cookies }) => {
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

  const rut = sanitizeString((payload as Record<string, unknown>).rut);
  const primerNombre = sanitizeString(
    (payload as Record<string, unknown>).primerNombre,
  );
  const segundoNombreRaw = sanitizeString(
    (payload as Record<string, unknown>).segundoNombre,
  );
  const apellidoPaterno = sanitizeString(
    (payload as Record<string, unknown>).apellidoPaterno,
  );
  const apellidoMaterno = sanitizeString(
    (payload as Record<string, unknown>).apellidoMaterno,
  );
  const correo = sanitizeString((payload as Record<string, unknown>).correo);
  const celular = sanitizeString((payload as Record<string, unknown>).celular);
  const direccion = sanitizeString(
    (payload as Record<string, unknown>).direccion,
  );
  const estado =
    sanitizeString((payload as Record<string, unknown>).estado) || "Activo";
  const cargoRaw = sanitizeString((payload as Record<string, unknown>).cargo).toUpperCase();
  const cargo = cargoRaw || "";
  const especialidadIdValue = (payload as Record<string, unknown>)
    .especialidadId;

  if (
    !rut ||
    !primerNombre ||
    !apellidoPaterno ||
    !apellidoMaterno ||
    !correo ||
    !celular ||
    !direccion ||
    !cargo
  ) {
    return jsonResponse(400, {
      error:
        "Faltan datos obligatorios. Verifica RUT, nombres, apellidos, cargo y datos de contacto.",
    });
  }

  if (!isValidCargo(cargo)) {
    return jsonResponse(400, {
      error: "Cargo invalido. Debes seleccionar admin, recepcion o medico.",
    });
  }

  const normalizedRut = normalizeRut(rut);

  if (!normalizedRut || normalizedRut.length < 3 || !normalizedRut.includes("-")) {
    return jsonResponse(400, { error: "RUT invalido." });
  }

  let especialidadId: number | null = null;

  if (cargo === "MEDICO") {
    const parsedEspecialidadId = Number(especialidadIdValue);
    if (!Number.isInteger(parsedEspecialidadId) || parsedEspecialidadId <= 0) {
      return jsonResponse(400, { error: "Debes seleccionar la especialidad para medicos." });
    }
    especialidadId = parsedEspecialidadId;
  }

  const existingUser = await prisma.usuario.findUnique({
    where: { rut: normalizedRut },
    select: { id_usuario: true },
  });

  if (existingUser) {
    return jsonResponse(409, {
      error:
        "Ya existe un usuario registrado con ese RUT. Verifica la informacion antes de continuar.",
    });
  }

  const existingWorker = await getWorkerByRut(normalizedRut);

  if (existingWorker) {
    return jsonResponse(409, {
      error:
        "Ya existe un trabajador registrado con ese RUT. Si necesitas reactivar el acceso, actualiza sus datos.",
    });
  }

  let especialidad: { id_especialidad: number; nombre_especialidad: string } | null = null;
  if (cargo === "MEDICO") {
    const especialidadRecord = await prisma.especialidad.findUnique({
      where: { id_especialidad: especialidadId! },
      select: { id_especialidad: true, nombre_especialidad: true },
    });

    if (!especialidadRecord) {
      return jsonResponse(404, { error: "Especialidad no encontrada." });
    }

    especialidad = especialidadRecord;
  }

  const primerNombreToken = primerNombre.split(/\s+/)[0]?.toLowerCase() ?? "";

  if (!primerNombreToken) {
    return jsonResponse(400, {
      error: "El primer nombre no es valido para generar la contrasena.",
    });
  }

  const initialPassword = `${normalizedRut}${primerNombreToken}`;
  const hashedPassword = await bcrypt.hash(initialPassword, 10);
  const segundoNombre =
    segundoNombreRaw.length > 0 ? segundoNombreRaw : undefined;

  try {
    const createdWorker = await prisma.$transaction(async (tx) => {
      await tx.usuario.create({
        data: {
          rut: normalizedRut,
          password: hashedPassword,
        },
      });

      return tx.trabajador.create({
        data: {
          primer_nombre_trabajador: primerNombre,
          segundo_nombre_trabajador: segundoNombre,
          apellido_p_trabajador: apellidoPaterno,
          apellido_m_trabajador: apellidoMaterno,
          rut_trabajador: normalizedRut,
          celular_trabajador: celular,
          correo_trabajador: correo,
          direccion_trabajador: direccion,
          estado_trabajador: estado,
          cargo,
          id_especialidad: cargo === "MEDICO" ? especialidad?.id_especialidad ?? null : null,
        },
        include: {
          especialidad: {
            select: {
              id_especialidad: true,
              nombre_especialidad: true,
            },
          },
        },
      });
    });

    return jsonResponse(201, {
      message: "Trabajador creado correctamente.",
      initialPassword,
      trabajador: {
        id: createdWorker.id_trabajador,
        nombres: `${createdWorker.primer_nombre_trabajador}${
          createdWorker.segundo_nombre_trabajador
            ? ` ${createdWorker.segundo_nombre_trabajador}`
            : ""
        }`.trim(),
        apellidos: `${createdWorker.apellido_p_trabajador} ${createdWorker.apellido_m_trabajador}`,
        rut: createdWorker.rut_trabajador,
        cargo: createdWorker.cargo,
        especialidad: createdWorker.especialidad?.nombre_especialidad ?? null,
        estado: createdWorker.estado_trabajador,
      },
    });
  } catch (error) {
    console.error("create worker error", error);
    return jsonResponse(500, {
      error:
        "No pudimos crear el trabajador. Intenta nuevamente o revisa los datos ingresados.",
    });
  }
};

export const PATCH: APIRoute = async ({ request, cookies }) => {
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

  const trabajadorIdValue = (payload as Record<string, unknown>).trabajadorId;
  const action = sanitizeString((payload as Record<string, unknown>).action).toLowerCase();
  let nextEstado = sanitizeString((payload as Record<string, unknown>).estado);

  if (!nextEstado) {
    if (action === "desactivar" || action === "deactivate") {
      nextEstado = "Inactivo";
    } else if (action === "activar" || action === "activate") {
      nextEstado = "Activo";
    }
  }

  const trabajadorId = Number(trabajadorIdValue);

  if (!Number.isInteger(trabajadorId) || trabajadorId <= 0) {
    return jsonResponse(400, { error: "Identificador de trabajador invalido." });
  }

  if (!["Activo", "Inactivo"].includes(nextEstado)) {
    return jsonResponse(400, { error: "Estado solicitado no valido." });
  }

  const currentWorker = await prisma.trabajador.findUnique({
    where: { id_trabajador: trabajadorId },
    select: { cargo: true, id_especialidad: true },
  });

  if (!currentWorker) {
    return jsonResponse(404, { error: "Trabajador no encontrado." });
  }

  try {
    const updatedWorker = await prisma.$transaction(async (tx) => {
      const worker = await tx.trabajador.update({
        where: { id_trabajador: trabajadorId },
        data: { estado_trabajador: nextEstado },
        include: {
          especialidad: {
            select: {
              id_especialidad: true,
              nombre_especialidad: true,
            },
          },
        },
      });

      if (nextEstado !== "Activo") {
        const user = await tx.usuario.findUnique({
          where: { rut: worker.rut_trabajador },
          select: { id_usuario: true },
        });

        if (user) {
          await tx.session.deleteMany({ where: { user_id: user.id_usuario } });
        }
      }

      return worker;
    });

    return jsonResponse(200, {
      message:
        nextEstado === "Activo"
          ? "Trabajador reactivado correctamente."
          : "Trabajador desactivado correctamente.",
      trabajador: {
        id: updatedWorker.id_trabajador,
        rut: updatedWorker.rut_trabajador,
        estado: updatedWorker.estado_trabajador,
        cargo: updatedWorker.cargo,
        especialidad: updatedWorker.especialidad?.nombre_especialidad ?? "Sin asignar",
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return jsonResponse(404, { error: "Trabajador no encontrado." });
    }

    console.error("update worker status error", error);
    return jsonResponse(500, {
      error: "No pudimos actualizar el estado. Intenta nuevamente mas tarde.",
    });
  }
};

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

  const trabajadorId = Number((payload as Record<string, unknown>).trabajadorId);

  if (!Number.isInteger(trabajadorId) || trabajadorId <= 0) {
    return jsonResponse(400, { error: "Trabajador invalido." });
  }

  const currentWorker = await prisma.trabajador.findUnique({
    where: { id_trabajador: trabajadorId },
    select: { cargo: true, id_especialidad: true },
  });

  if (!currentWorker) {
    return jsonResponse(404, { error: "Trabajador no encontrado." });
  }

  const body = payload as Record<string, unknown>;

  const primerNombre = sanitizeString(body.primerNombre);
  const segundoNombreRaw = sanitizeString(body.segundoNombre);
  const apellidoPaterno = sanitizeString(body.apellidoPaterno);
  const apellidoMaterno = sanitizeString(body.apellidoMaterno);
  const correo = sanitizeString(body.correo);
  const celular = sanitizeString(body.celular);
  const direccion = sanitizeString(body.direccion);
  const estado = sanitizeString(body.estado);
  const cargoRaw = sanitizeString(body.cargo).toUpperCase();

  const especialidadValue = body.especialidadId;
  let especialidadId: number | null | undefined = undefined;

  if (especialidadValue !== undefined) {
    if (especialidadValue === null || especialidadValue === "" || especialidadValue === "none") {
      especialidadId = null;
    } else {
      const parsedEspecialidad = Number(especialidadValue);
      if (!Number.isInteger(parsedEspecialidad) || parsedEspecialidad <= 0) {
        return jsonResponse(400, { error: "Especialidad invalida." });
      }
      especialidadId = parsedEspecialidad;
    }
  }

  const hasField = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
  const data: Record<string, unknown> = {};

  if (hasField("primerNombre")) {
    if (!primerNombre) {
      return jsonResponse(400, { error: "El primer nombre es obligatorio." });
    }
    data.primer_nombre_trabajador = primerNombre;
  }

  if (hasField("segundoNombre")) {
    data.segundo_nombre_trabajador = segundoNombreRaw.length > 0 ? segundoNombreRaw : null;
  }

  if (hasField("apellidoPaterno")) {
    if (!apellidoPaterno) {
      return jsonResponse(400, { error: "El apellido paterno es obligatorio." });
    }
    data.apellido_p_trabajador = apellidoPaterno;
  }

  if (hasField("apellidoMaterno")) {
    if (!apellidoMaterno) {
      return jsonResponse(400, { error: "El apellido materno es obligatorio." });
    }
    data.apellido_m_trabajador = apellidoMaterno;
  }

  if (hasField("correo")) {
    if (!correo) {
      return jsonResponse(400, { error: "El correo es obligatorio." });
    }
    data.correo_trabajador = correo;
  }

  if (hasField("celular")) {
    if (!celular) {
      return jsonResponse(400, { error: "El celular es obligatorio." });
    }
    data.celular_trabajador = celular;
  }

  if (hasField("direccion")) {
    if (!direccion) {
      return jsonResponse(400, { error: "La direccion es obligatoria." });
    }
    data.direccion_trabajador = direccion;
  }

  if (hasField("estado")) {
    if (!estado) {
      return jsonResponse(400, { error: "El estado es obligatorio." });
    }
    data.estado_trabajador = estado;
  }

  if (hasField("cargo")) {
    if (!cargoRaw) {
      return jsonResponse(400, { error: "El cargo es obligatorio." });
    }
    if (!isValidCargo(cargoRaw)) {
      return jsonResponse(400, {
        error: "Cargo invalido. Usa admin, recepcion o medico.",
      });
    }
    data.cargo = cargoRaw;
  }

  if (especialidadId !== undefined) {
    if (especialidadId === null) {
      data.id_especialidad = null;
    } else {
      const especialidad = await prisma.especialidad.findUnique({
        where: { id_especialidad: especialidadId },
        select: { id_especialidad: true },
      });

      if (!especialidad) {
        return jsonResponse(404, { error: "Especialidad no encontrada." });
      }

      data.id_especialidad = especialidad.id_especialidad;
    }
  }

  const finalCargo = hasField("cargo") ? cargoRaw : currentWorker.cargo;
  const finalEspecialidad =
    especialidadId !== undefined ? especialidadId : currentWorker.id_especialidad;

  if (finalCargo !== "MEDICO") {
    data.id_especialidad = null;
  }

  if (finalCargo === "MEDICO" && !finalEspecialidad) {
    return jsonResponse(400, {
      error: "Los medicos deben contar con una especialidad asignada.",
    });
  }

  if (Object.keys(data).length === 0) {
    return jsonResponse(400, { error: "No se enviaron cambios para actualizar." });
  }

  try {
    const updatedWorker = await prisma.trabajador.update({
      where: { id_trabajador: trabajadorId },
      data,
      include: {
        especialidad: {
          select: {
            id_especialidad: true,
            nombre_especialidad: true,
          },
        },
      },
    });

    return jsonResponse(200, {
      message: "Trabajador actualizado correctamente.",
      trabajador: {
        id: updatedWorker.id_trabajador,
        rut: updatedWorker.rut_trabajador,
        nombre: `${updatedWorker.primer_nombre_trabajador}${
          updatedWorker.segundo_nombre_trabajador ? ` ${updatedWorker.segundo_nombre_trabajador}` : ""
        } ${updatedWorker.apellido_p_trabajador} ${updatedWorker.apellido_m_trabajador}`.trim(),
        correo: updatedWorker.correo_trabajador,
        celular: updatedWorker.celular_trabajador,
        direccion: updatedWorker.direccion_trabajador,
        estado: updatedWorker.estado_trabajador,
        cargo: updatedWorker.cargo,
        especialidad: updatedWorker.especialidad?.nombre_especialidad ?? "Sin asignar",
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return jsonResponse(404, { error: "Trabajador no encontrado." });
    }

    console.error("update worker data error", error);
    return jsonResponse(500, {
      error: "No pudimos actualizar los datos del trabajador.",
    });
  }
};
