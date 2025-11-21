import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/pages/api/reservas/index";
import { prisma } from "@/lib/prisma";
import { getSessionFromToken, SESSION_COOKIE_NAME } from "@/utils/session";
import { getWorkerByRut, GENERAL_SPECIALTY_NAME } from "@/utils/admin";

// ----------------------
// MOCKS
// ----------------------

vi.mock("@/utils/session", async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    SESSION_COOKIE_NAME: "test-session",
    getSessionFromToken: vi.fn(),
  };
});

vi.mock("@/utils/admin", () => ({
  GENERAL_SPECIALTY_NAME: "Medicina General",
  getWorkerByRut: vi.fn(),
}));

// Prisma mock estructurado EXACTO como lo usa la API
vi.mock("@/lib/prisma", () => {
  const updateMany = vi.fn();
  const findUnique = vi.fn();

  return {
    prisma: {
      paciente: { findFirst: vi.fn() },

      disponibilidadTrabajador: {
        updateMany,
        findUnique,
      },

      // Transacción que debe llamar a updateMany → findUnique
      $transaction: vi.fn(async (fn) =>
        fn({
          disponibilidadTrabajador: {
            updateMany,
            findUnique,
          },
        })
      ),
    },
  };
});

// Helper cookies
const mockCookies = (token: string | null) => ({
  get: vi.fn(() => (token ? { value: token } : undefined)),
  delete: vi.fn(),
});

// ----------------------
// TESTS
// ----------------------

describe("POST /api/reservas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rechaza si no hay sesión", async () => {
    (getSessionFromToken as any).mockResolvedValue(null);

    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ disponibilidadId: 1 }),
    });

    const res = await POST({ request: req, cookies: mockCookies(null) });
    expect(res.status).toBe(401);
  });

  it("rechaza si el payload es inválido", async () => {
    (getSessionFromToken as any).mockResolvedValue({
      usuario: { rut: "12345678-9" },
    });

    const req = new Request("http://localhost", {
      method: "POST",
      body: "no-json",
    });

    const res = await POST({
      request: req,
      cookies: mockCookies("token123"),
    });

    expect(res.status).toBe(400);
  });

  it("rechaza disponibilidadId inválido", async () => {
    (getSessionFromToken as any).mockResolvedValue({
      usuario: { rut: "12345678-9" },
    });

    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ disponibilidadId: -5 }),
    });

    const res = await POST({
      request: req,
      cookies: mockCookies("token123"),
    });

    expect(res.status).toBe(400);
  });

  it("retorna 404 si no existe paciente", async () => {
    (getSessionFromToken as any).mockResolvedValue({
      usuario: { rut: "99999999-9" },
    });

    (getWorkerByRut as any).mockResolvedValue(null);

    (prisma.paciente.findFirst as any).mockResolvedValue(null);

    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ disponibilidadId: 2 }),
    });

    const res = await POST({
      request: req,
      cookies: mockCookies("X"),
    });

    expect(res.status).toBe(404);
  });

  it("reserva correctamente", async () => {
    (getSessionFromToken as any).mockResolvedValue({
      usuario: { rut: "12345678-9" },
    });

    (getWorkerByRut as any).mockResolvedValue(null);

    // paciente existente
    (prisma.paciente.findFirst as any).mockResolvedValue({
      id_paciente: 10,
      primer_nombre_paciente: "Ana",
      apellido_p_paciente: "Torres",
      correo_paciente: "ana@mail.cl",
    });

    // updateMany → debe devolver { count: 1 }
    (prisma.disponibilidadTrabajador.updateMany as any).mockResolvedValue({
      count: 1,
    });

    // findUnique → para construir booking final
    (prisma.disponibilidadTrabajador.findUnique as any).mockResolvedValue({
      id_disponibilidad: 1,
      fecha: new Date("2025-01-01T12:00:00Z"),
      nota: "Test",
      trabajador: {
        primer_nombre_trabajador: "Juan",
        segundo_nombre_trabajador: null,
        apellido_p_trabajador: "Pérez",
        apellido_m_trabajador: null,
        especialidad: { nombre_especialidad: "Medicina General" },
      },
    });

    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ disponibilidadId: 1, nota: "Test" }),
    });

    const res = await POST({
      request: req,
      cookies: mockCookies("token123"),
    });

    expect(res.status).toBe(201);
  });
});
