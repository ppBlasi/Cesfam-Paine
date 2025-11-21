export const normalizeRut = (rut: string) => {
  // limpiar todo excepto números y k/K
  const cleaned = rut.replace(/[^0-9kK]/g, "").toUpperCase();

  if (cleaned.length <= 1) return cleaned;

  const body = cleaned.slice(0, -1);
  let verifier = cleaned.slice(-1);

  // Forzar DV válido (0-9 o K)
  if (!/^[0-9K]$/.test(verifier)) verifier = "K";

  return `${body}-${verifier}`;
};
