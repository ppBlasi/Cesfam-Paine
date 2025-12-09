export const prerender = false;
export const runtime = "nodejs";

import type { APIRoute } from "astro";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { prisma } from "../../../../lib/prisma";
import { SESSION_COOKIE_NAME, getSessionFromToken } from "../../../../utils/session";
import { isAdminByRut } from "../../../../utils/admin";

const jsonResponse = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

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
    return jsonResponse(400, { error: "Debes adjuntar un archivo." });
  }

  const order = await prisma.examOrder.findUnique({
    where: { id: orderId },
    select: { id: true },
  });

  if (!order) {
    return jsonResponse(404, { error: "No encontramos la orden de examen." });
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

    await prisma.examOrder.update({
      where: { id: orderId },
      data: {
        resultado_url: publicUrl,
        updated_at: now,
      },
    });

    const accept = request.headers.get("accept") ?? "";

    // Responder JSON para peticiones fetch/async, y redirect para formularios estándar
    if (accept.includes("application/json")) {
      return jsonResponse(200, { message: "Resultado reemplazado correctamente.", url: publicUrl });
    }

    return Response.redirect("/admin/examenes", 303);
  } catch (error) {
    console.error("admin replace exam error", error);
    return jsonResponse(500, { error: "No pudimos guardar el archivo." });
  }
};
