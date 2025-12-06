export function ensurePatientSession(session) {
  // No hay sesión
  if (!session || !session.user) {
    return {
      ok: false,
      error: "Sesión no encontrada",
    };
  }

  // No tiene id_paciente → no es paciente válido
  if (!session.user.id_paciente) {
    return {
      ok: false,
      error: "El usuario no es paciente",
    };
  }

  // Sesión válida
  return {
    ok: true,
    id_paciente: session.user.id_paciente,
  };
}
