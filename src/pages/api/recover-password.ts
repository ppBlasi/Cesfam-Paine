import type { APIRoute } from "astro";
import { prisma } from "../../lib/prisma";
import { normalizeRut } from "../../utils/rut";

const jsonResponse = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });

export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as { rut?: string } | null;

  if (!body) {
    return jsonResponse(400, { error: "Solicitud inválida." });
  }

  const rut = body.rut?.trim() ?? "";

  if (!rut) {
    return jsonResponse(400, { error: "Debes ingresar tu RUT." });
  }

  const normalizedRut = normalizeRut(rut);

  try {
    const user = await prisma.usuario.findUnique({ where: { rut: normalizedRut } });

    if (!user) {
      return jsonResponse(404, { error: "No encontramos una cuenta con ese RUT." });
    }

    return jsonResponse(200, {
      message: "Enviamos instrucciones de recuperación al correo registrado. Revisa tu bandeja de entrada.",
    });
  } catch (error) {
    console.error("recover-password error", error);
    return jsonResponse(500, { error: "No pudimos procesar la recuperación. Inténtalo más tarde." });
  }
};
