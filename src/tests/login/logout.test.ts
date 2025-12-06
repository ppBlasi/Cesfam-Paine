// tests/login/logout.test.ts
import { describe, it, expect, vi } from "vitest";
import { POST } from "../../pages/api/logout";
import { deleteSessionByToken } from "../../utils/session";

vi.mock("../../utils/session", () => ({
  deleteSessionByToken: vi.fn(),
  SESSION_COOKIE_NAME: "session_token",
}));

describe("POST /api/logout", () => {
  const mockCookies = (token = null) => ({
    get: vi.fn(() => (token ? { value: token } : null)),
    delete: vi.fn(),
  });

  it("debe eliminar sesión si existe token", async () => {
    const cookies = mockCookies("abc");

    const res = await POST({ cookies });

    expect(deleteSessionByToken).toHaveBeenCalledWith("abc");
    expect(cookies.delete).toHaveBeenCalled();
    expect(res.status).toBe(204);
  });

  it("debe responder 204 si no hay token", async () => {
    const cookies = mockCookies(null);

    const res = await POST({ cookies });

    expect(res.status).toBe(204);
  });
});
