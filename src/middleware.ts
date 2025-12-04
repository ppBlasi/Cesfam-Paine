import type { MiddlewareHandler } from "astro";
import { SESSION_COOKIE_NAME, getSessionFromToken } from "./utils/session";
import {
  ADMIN_CARGO,
  ADMIN_SPECIALTY_NAME,
  getWorkerByRut,
} from "./utils/admin";

type AuthenticatedUser = {
  id: number;
  rut: string;
  isAdmin: boolean;
  isWorker: boolean;
  worker:
    | {
        id: number;
        estado: string;
        cargo: string;
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
        workerRecord?.cargo === ADMIN_CARGO ||
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
              cargo: workerRecord.cargo,
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
  const isPatient = Boolean(user && !user.isWorker && !user.isAdmin);

  /**
   * Ruta -> regla de autorizacion.
   * Se evalua en orden; al primer match se aplica.
   */
  const routeRules: Array<{
    match: (path: string) => boolean;
    allow: (user: AuthenticatedUser | null) => boolean;
  }> = [
    {
      match: (path) => path.startsWith("/admin"),
      allow: (u) => Boolean(u?.isAdmin),
    },
    {
      match: (path) => path.startsWith("/trabajador"),
      allow: (u) => Boolean(u && (u.isWorker || u.isAdmin)),
    },
    {
      match: (path) => path.startsWith("/perfil") || path.startsWith("/reserva"),
      allow: () => isPatient,
    },
  ];

  for (const rule of routeRules) {
    if (!rule.match(pathname)) continue;
    const allowed = rule.allow(user);
    if (!allowed) {
      // Si no hay sesion, pide login; si hay pero sin permiso, redirige al home.
      return context.redirect(user ? "/" : "/login");
    }
    // ya se aplico la regla, no hace falta evaluar otras
    break;
  }

  return next();
};
