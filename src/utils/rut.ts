export const normalizeRut = (rut: string) => {
  const cleaned = rut.replace(/[^0-9kK]/g, '').toUpperCase();

  if (cleaned.length <= 1) {
    return cleaned;
  }

  const body = cleaned.slice(0, -1);
  const verifier = cleaned.slice(-1);
  return `${body}-${verifier}`;
};
