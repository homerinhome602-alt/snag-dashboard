import { cookies } from "next/headers";
import { SignJWT } from "jose";
import {
  authSecret,
  verifySessionToken,
  SESSION_COOKIE_NAME,
  SESSION_TTL,
  type SessionClaims,
} from "./jwt";

export type { SessionClaims };
export { SESSION_COOKIE_NAME, verifySessionToken };

async function sign(payload: Record<string, unknown>, ttl: number): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(authSecret());
}

export async function createSession(user: { id: string; email: string }): Promise<void> {
  const token = await sign(
    { sub: user.id, email: user.email, role: "authenticated" },
    SESSION_TTL
  );
  const jar = await cookies();
  jar.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE_NAME);
}

export async function readSession(): Promise<SessionClaims | null> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE_NAME)?.value);
}
