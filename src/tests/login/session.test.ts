// tests/login/session.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../lib/prisma";
import {
  hashToken,
  generateSessionToken,
  createUserSession,
  getSessionFromToken,
  deleteSessionByToken,
} from "../../utils/session";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

describe("session utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hashToken debe generar un SHA256 válido", () => {
    const hash = hashToken("abc123");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("generateSessionToken debe retornar un token hexadecimal", () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[a-f0-9]+$/i);
    expect(token.length).toBeGreaterThan(20);
  });

  it("createUserSession debe crear una sesión en BD", async () => {
    prisma.session.create.mockResolvedValue({});

    const result = await createUserSession(10);

    expect(result.token).toBeDefined();
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(prisma.session.create).toHaveBeenCalledTimes(1);
  });

  it("getSessionFromToken devuelve null si no existe la sesión", async () => {
    prisma.session.findUnique.mockResolvedValue(null);

    const session = await getSessionFromToken("abc");
    expect(session).toBeNull();
  });

  it("getSessionFromToken elimina sesión expirada", async () => {
    const expired = new Date(Date.now() - 10000);

    prisma.session.findUnique.mockResolvedValue({
      token_hash: "x",
      expires_at: expired,
      usuario: null,
    });

    const result = await getSessionFromToken("abc");

    expect(prisma.session.delete).toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("deleteSessionByToken debe eliminar sesiones", async () => {
    prisma.session.deleteMany.mockResolvedValue({ count: 1 });

    await deleteSessionByToken("token123");

    expect(prisma.session.deleteMany).toHaveBeenCalledTimes(1);
  });
});
