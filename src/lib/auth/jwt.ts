import { jwtVerify } from "jose";

// Edge-safe: no next/headers, no Node APIs — importable from proxy/middleware.

export const SESSION_COOKIE_NAME = "snag_session";
export const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

export type SessionClaims = {
  sub: string;
  email: string;
  role: "authenticated";
};

export function authSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

export async function verifySessionToken(
  token: string | undefined
): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authSecret());
    if (!payload.sub || typeof payload.email !== "string") return null;
    return { sub: String(payload.sub), email: payload.email, role: "authenticated" };
  } catch {
    return null;
  }
}
