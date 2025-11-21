import { describe, it, expect } from "vitest";
import { hashToken, generateSessionToken } from "../../utils/session";

describe("session utils", () => {
  it("hashToken debe generar un hash distinto al token", () => {
    const token = "abc123";
    const hashed = hashToken(token);
    expect(hashed).not.toBe(token);
  });

  it("generateSessionToken debe generar token de 48 bytes", () => {
    const token = generateSessionToken();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(40);
  });
});
