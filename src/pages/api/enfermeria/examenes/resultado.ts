export const prerender = false;
export const runtime = "nodejs";

import type { APIRoute, AstroCookies } from "astro";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
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

export const POST: APIRoute = async ({ request, cookies }) => {
  const nurse = await ensureNurseSession(cookies);

  if (!nurse) {
    return jsonResponse(403, { error: "Debes iniciar sesion como enfermeria para subir resultados." });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return jsonResponse(400, { error: "Solicitud invalida." });
  }

  const orderIdRaw = form.get("examOrderId") ?? form.get("id");
  let orderId: bigint;
  try {
    orderId = BigInt(
      typeof orderIdRaw === "string" || typeof orderIdRaw === "number"
        ? orderIdRaw
        : "",
    );
  } catch {
    return jsonResponse(400, { error: "Orden invalida." });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return jsonResponse(400, { error: "Debes adjuntar un archivo de resultado." });
  }

  const order = await prisma.examOrder.findUnique({
    where: { id: orderId },
    select: { id: true, estado: true, resultado_url: true },
  });

  if (!order) {
    return jsonResponse(404, { error: "No encontramos la orden de examen." });
  }

  if (order.estado === "REALIZADO" && order.resultado_url) {
    return jsonResponse(400, { error: "La orden ya fue finalizada." });
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const uploadsDir = path.join(process.cwd(), "public", "uploads", "exams");
    await fs.mkdir(uploadsDir, { recursive: true });

    const hash = crypto.randomBytes(8).toString("hex");
    const ext = path.extname(file.name) || ".bin";
    const filename = `${Date.now()}-${hash}${ext}`;
    const filepath = path.join(uploadsDir, filename);

    await fs.writeFile(filepath, buffer);

    const publicUrl = `/uploads/exams/${filename}`;
    const now = new Date();

    const updatedOrder = await prisma.examOrder.update({
      where: { id: orderId },
      data: {
        estado: "REALIZADO",
        resultado_url: publicUrl,
        nurse_id: nurse.workerId,
        updated_at: now,
      },
      select: { id: true },
    });

    return jsonResponse(200, { message: "Resultado guardado correctamente.", url: publicUrl, id: updatedOrder.id?.toString?.() ?? null });
  } catch (error) {
    console.error("exam order upload error", error);
    return jsonResponse(500, { error: "No pudimos guardar el resultado." });
  }
};
