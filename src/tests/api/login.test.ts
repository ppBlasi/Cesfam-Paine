import { describe, it, expect, vi } from "vitest";
import { POST } from "../../pages/api/login";
import bcrypt from "bcryptjs";

// Prisma mock
vi.mock("../../../src/lib/prisma", () => ({
  prisma: {
    usuario: {
      findUnique: vi.fn(),
    },
    session: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// Helpers reales usados por login
vi.mock("../../../src/utils/rut", () => ({
  normalizeRut: (r: string) =>
    r.replace(/[^0-9kK]/g, "").toUpperCase().replace(/(K)$/, "-K"),
}));

vi.mock("../../../src/utils/admin", () => ({
  getWorkerByRut: vi.fn().mockResolvedValue(null),
  ADMIN_SPECIALTY_NAME: "Administrador",
}));

vi.mock("../../../src/utils/session", () => ({
  SESSION_COOKIE_NAME: "session",
  createUserSession: vi.fn().mockResolvedValue({
    token: "mocked_token",
    expiresAt: new Date(Date.now() + 3000),
  }),
  sessionCookieOptions: () => ({}),
}));

// mock cookies
const mockCookies = () => ({
  get: vi.fn(() => undefined),
  set: vi.fn(() => undefined),
});

describe("API /api/login", () => {
  const mockedUser = {
    id_usuario: 1,
    rut: "12345678-9",
    password: bcrypt.hashSync("1234", 10),
  };

  it("rechaza peticiones sin body", async () => {
    const req = new Request("http://localhost", { method: "POST" });
    const res = await POST({ request: req, cookies: mockCookies() });
    expect(res.status).toBe(400);
  });

  it("rechaza si falta rut o password", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ rut: "" }),
    });

    const res = await POST({ request: req, cookies: mockCookies() });
    expect(res.status).toBe(400);
  });

  it("rechaza si el rut no existe", async () => {
    const prisma = (await import("../../../src/lib/prisma")).prisma;
    prisma.usuario.findUnique.mockResolvedValue(null);

    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ rut: "12345678-9", password: "1234" }),
    });

    const res = await POST({ request: req, cookies: mockCookies() });
    expect(res.status).toBe(401);
  });

  it("permite login correcto", async () => {
    const prisma = (await import("../../../src/lib/prisma")).prisma;
    prisma.usuario.findUnique.mockResolvedValue(mockedUser);

    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ rut: "12.345.678-9", password: "1234" }),
    });

    const res = await POST({ request: req, cookies: mockCookies() });
    expect(res.status).toBe(200);
  });
});
