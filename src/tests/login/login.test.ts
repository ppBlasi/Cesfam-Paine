import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../../pages/api/login";
import { prisma } from "../../lib/prisma";
import bcrypt from "bcryptjs";
import { createUserSession } from "../../utils/session";
import { getWorkerByRut } from "../../utils/admin";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    usuario: {
      findUnique: vi.fn(),
    },
    session: {
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn() },
}));

vi.mock("../../utils/session", () => ({
  createUserSession: vi.fn(),
  sessionCookieOptions: () => ({}),
  SESSION_COOKIE_NAME: "session_token",
}));

vi.mock("../../utils/admin", () => ({
  getWorkerByRut: vi.fn(),
  ADMIN_CARGO: "Administrador",
  ADMIN_SPECIALTY_NAME: "Administración",
}));

describe("POST /api/login", () => {
  beforeEach(() => vi.clearAllMocks());

  const mockCookies = () => {
    const store = {};
    return {
      get: vi.fn(),
      set: vi.fn((k, v) => (store[k] = v)),
      delete: vi.fn((k) => delete store[k]),
    };
  };

  const makeRequest = (body: any) =>
    new Request("http://localhost/api/login", {
      method: "POST",
      body: JSON.stringify(body),
    });

  it("debe devolver 400 si el JSON es inválido", async () => {
    const req = new Request("http://x/api/login", { method: "POST", body: "NOT_JSON" });

    const res = await POST({ request: req, cookies: mockCookies() });
    expect(res.status).toBe(400);
  });

  it("debe devolver 401 si el usuario no existe", async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);

    const res = await POST({
      request: makeRequest({ rut: "1-9", password: "123" }),
      cookies: mockCookies(),
    });

    expect(res.status).toBe(401);
  });

  it("debe devolver 401 si la contraseña está mal", async () => {
    prisma.usuario.findUnique.mockResolvedValue({ id_usuario: 1, password: "hash" });
    bcrypt.compare.mockResolvedValue(false);

    const res = await POST({
      request: makeRequest({ rut: "1-9", password: "no" }),
      cookies: mockCookies(),
    });

    expect(res.status).toBe(401);
  });

  it("debe bloquear login si el trabajador está inactivo", async () => {
    prisma.usuario.findUnique.mockResolvedValue({ id_usuario: 1, password: "x" });
    bcrypt.compare.mockResolvedValue(true);

    getWorkerByRut.mockResolvedValue({ estado_trabajador: "Inactivo" });

    const res = await POST({
      request: makeRequest({ rut: "1-9", password: "ok" }),
      cookies: mockCookies(),
    });

    expect(res.status).toBe(403);
  });

  it("debe iniciar sesión correctamente", async () => {
    prisma.usuario.findUnique.mockResolvedValue({ id_usuario: 5, password: "hash" });
    bcrypt.compare.mockResolvedValue(true);

    getWorkerByRut.mockResolvedValue(null);

    createUserSession.mockResolvedValue({
      token: "abc123",
      expiresAt: new Date(),
    });

    const cookies = mockCookies();

    const res = await POST({
      request: makeRequest({ rut: "1-9", password: "ok" }),
      cookies,
    });

    expect(res.status).toBe(200);
    expect(cookies.set).toHaveBeenCalledOnce();
  });
});
