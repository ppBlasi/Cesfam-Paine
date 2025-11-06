import type { MiddlewareHandler } from "astro";
import { SESSION_COOKIE_NAME, getSessionFromToken } from "./utils/session";
import { ADMIN_SPECIALTY_NAME, getWorkerByRut } from "./utils/admin";

type AuthenticatedUser = {
  id: number;
  rut: string;
  isAdmin: boolean;
  isWorker: boolean;
  worker:
    | {
        id: number;
        estado: string;
        specialtyId: number | null;
        specialtyName: string | null;
      }
    | null;
};

export const onRequest: MiddlewareHandler = async (context, next) => {
  const token = context.cookies.get(SESSION_COOKIE_NAME)?.value;
  let user: AuthenticatedUser | null = null;

  if (token) {
    const session = await getSessionFromToken(token);

    if (session) {
      const workerRecord = await getWorkerByRut(session.usuario.rut);
      const isWorker = Boolean(workerRecord);
      const isAdmin =
        Boolean(workerRecord?.especialidad) &&
        workerRecord?.especialidad?.nombre_especialidad ===
          ADMIN_SPECIALTY_NAME;

      user = {
        id: session.usuario.id_usuario,
        rut: session.usuario.rut,
        isAdmin,
        isWorker,
        worker: workerRecord
          ? {
              id: workerRecord.id_trabajador,
              estado: workerRecord.estado_trabajador,
              specialtyId: workerRecord.especialidad?.id_especialidad ?? null,
              specialtyName:
                workerRecord.especialidad?.nombre_especialidad ?? null,
            }
          : null,
      };
    } else {
      context.cookies.delete(SESSION_COOKIE_NAME, { path: "/" });
    }
  }

  context.locals.user = user;

  const pathname = context.url.pathname;
  const isProtectedRoute =
    pathname.startsWith("/perfil") ||
    pathname.startsWith("/reserva") ||
    pathname.startsWith("/trabajador");
  const isAdminRoute = pathname.startsWith("/admin");
  const isWorkerRoute = pathname.startsWith("/trabajador");

  if (isProtectedRoute && !user) {
    return context.redirect("/login");
  }

  if (isAdminRoute) {
    if (!user) {
      return context.redirect("/login");
    }

    if (!user.isAdmin) {
      return context.redirect("/");
    }
  }

  if (isWorkerRoute && user && !user.isWorker && !user.isAdmin) {
    return context.redirect("/");
  }

  return next();
};
