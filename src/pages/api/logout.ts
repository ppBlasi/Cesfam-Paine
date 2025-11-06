import type { APIRoute } from "astro";
import { SESSION_COOKIE_NAME, deleteSessionByToken } from "../../utils/session";

const jsonResponse = (status: number, payload: unknown = null) =>
  new Response(payload ? JSON.stringify(payload) : null, {
    status,
    headers: payload ? { "Content-Type": "application/json" } : undefined,
  });

export const POST: APIRoute = async ({ cookies }) => {
  const token = cookies.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await deleteSessionByToken(token);
  }

  cookies.delete(SESSION_COOKIE_NAME, { path: "/" });

  return jsonResponse(204);
};
