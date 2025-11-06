import crypto from "node:crypto";
import { prisma } from "../lib/prisma";

export const SESSION_COOKIE_NAME = "session_token";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 dias

export const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

export const generateSessionToken = () => crypto.randomBytes(48).toString("hex");

export const createUserSession = async (userId: number) => {
  const token = generateSessionToken();
  const hashedToken = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await prisma.session.create({
    data: {
      token_hash: hashedToken,
      user_id: userId,
      expires_at: expiresAt,
    },
  });

  return { token, expiresAt };
};

export const getSessionFromToken = async (token: string) => {
  const hashedToken = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { token_hash: hashedToken },
    include: { usuario: true },
  });

  if (!session) {
    return null;
  }

  if (session.expires_at < new Date()) {
    await prisma.session.delete({ where: { token_hash: hashedToken } });
    return null;
  }

  return session;
};

export const deleteSessionByToken = async (token: string) => {
  const hashed = hashToken(token);
  await prisma.session.deleteMany({ where: { token_hash: hashed } });
};

export const sessionCookieOptions = (expiresAt: Date) => ({
  httpOnly: true,
  secure: import.meta.env.PROD,
  sameSite: "lax" as const,
  path: "/",
  expires: expiresAt,
});
