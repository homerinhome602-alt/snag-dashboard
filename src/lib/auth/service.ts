import { randomUUID, randomBytes } from "crypto";
import { withServiceRole } from "@/lib/db/scope";
import { hashPassword, verifyPassword } from "./password";
import { createSession, clearSession, readSession, type SessionClaims } from "./session";
import { sendMail, passwordResetMail } from "./email";

type AuthError = { message: string; code?: string } | null;

const AUTOCONFIRM = process.env.AUTH_AUTOCONFIRM !== "false"; // default on for local

function token(): string {
  return randomBytes(24).toString("hex");
}

// ---- sign in -----------------------------------------------------------

export async function signInWithPassword(creds: {
  email: string;
  password: string;
}): Promise<{ data: { user: { id: string; email: string } | null }; error: AuthError }> {
  const email = creds.email.trim().toLowerCase();
  const row = await withServiceRole((c) =>
    c
      .query<{ id: string; email: string; encrypted_password: string; email_confirmed_at: Date | null }>(
        "select id, email, encrypted_password, email_confirmed_at from auth.users where lower(email) = $1 and deleted_at is null",
        [email]
      )
      .then((r) => r.rows[0] ?? null)
  );

  if (!row || !(await verifyPassword(creds.password, row.encrypted_password))) {
    return { data: { user: null }, error: { message: "Invalid login credentials", code: "invalid_credentials" } };
  }
  if (!row.email_confirmed_at && !AUTOCONFIRM) {
    return { data: { user: null }, error: { message: "Email not confirmed", code: "email_not_confirmed" } };
  }
  await createSession({ id: row.id, email: row.email });
  return { data: { user: { id: row.id, email: row.email } }, error: null };
}

// ---- sign up ---------------------------------------------------------

export async function signUp(params: {
  email: string;
  password: string;
  options?: { data?: { full_name?: string } };
}): Promise<{
  data: { user: { id: string; email: string } | null; session: { access_token: string } | null };
  error: AuthError;
}> {
  const email = params.email.trim().toLowerCase();
  const id = randomUUID();
  const pwHash = await hashPassword(params.password);
  const meta = { ...(params.options?.data ?? {}), email_verified: AUTOCONFIRM };
  const confirmedAt = AUTOCONFIRM ? new Date() : null;

  try {
    await withServiceRole(async (c) => {
      // the on_auth_user_created trigger creates the profile and enforces the
      // invitation gate (raises if the email has no invitations row).
      await c.query(
        `insert into auth.users
           (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token,
            is_sso_user, is_anonymous)
         values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
            $2, $3, $4, '{"provider":"email","providers":["email"]}'::jsonb, $5::jsonb,
            now(), now(), '', false, false)`,
        [id, email, pwHash, confirmedAt, JSON.stringify(meta)]
      );
      await c.query(
        `insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
         values ($1, $1, $2::jsonb, 'email', now(), now(), now())`,
        [id, JSON.stringify({ sub: id, email, email_verified: AUTOCONFIRM })]
      );
    });
  } catch (e) {
    const err = e as { message?: string; code?: string };
    const msg = err.message ?? String(e);
    if (msg.includes("duplicate key") && msg.includes("users_")) {
      return { data: { user: null, session: null }, error: { message: "User already registered", code: "user_already_exists" } };
    }
    if (msg.includes("no invitation found")) {
      return { data: { user: null, session: null }, error: { message: "Not invited", code: "not_invited" } };
    }
    return { data: { user: null, session: null }, error: { message: msg, code: err.code } };
  }

  if (AUTOCONFIRM) {
    await createSession({ id, email });
    return { data: { user: { id, email }, session: { access_token: "cookie" } }, error: null };
  }
  return { data: { user: { id, email }, session: null }, error: null };
}

// ---- sign out ------------------------------------------------------

export async function signOut(): Promise<{ error: AuthError }> {
  await clearSession();
  return { error: null };
}

// ---- claims / user ----------------------------------------------------

export async function getClaims(): Promise<{ data: { claims: SessionClaims } | null; error: AuthError }> {
  const claims = await readSession();
  return { data: claims ? { claims } : null, error: null };
}

export async function getUser(): Promise<{ data: { user: { id: string; email: string } | null }; error: AuthError }> {
  const claims = await readSession();
  return { data: { user: claims ? { id: claims.sub, email: claims.email } : null }, error: null };
}

// ---- password reset ------------------------------------------------

export async function resetPasswordForEmail(
  email: string,
  opts?: { redirectTo?: string }
): Promise<{ data: Record<string, never>; error: AuthError }> {
  const normalized = email.trim().toLowerCase();
  const tok = token();
  const updated = await withServiceRole((c) =>
    c
      .query(
        "update auth.users set recovery_token = $2, recovery_sent_at = now() where lower(email) = $1 and deleted_at is null returning id",
        [normalized, tok]
      )
      .then((r) => r.rows[0] ?? null)
  );

  // Never reveal whether the address exists.
  if (updated) {
    const redirect = opts?.redirectTo ?? "http://localhost:3000/auth/update-password";
    const origin = new URL(redirect).origin;
    const next = new URL(redirect).pathname || "/auth/update-password";
    const link = `${origin}/auth/confirm?token_hash=${tok}&type=recovery&next=${encodeURIComponent(next)}`;
    await sendMail(passwordResetMail(normalized, link));
  }
  return { data: {}, error: null };
}

// ---- verifyOtp (used by /auth/confirm) --------------------------------

export async function verifyOtp(params: {
  type: string;
  token_hash: string;
}): Promise<{ data: Record<string, never>; error: AuthError }> {
  const { type, token_hash } = params;
  const col = type === "recovery" ? "recovery_token" : "confirmation_token";
  const row = await withServiceRole((c) =>
    c
      .query<{ id: string; email: string }>(
        `select id, email from auth.users where ${col} = $1 and $1 <> '' and deleted_at is null`,
        [token_hash]
      )
      .then((r) => r.rows[0] ?? null)
  );
  if (!row) return { data: {}, error: { message: "Token has expired or is invalid", code: "otp_expired" } };

  // Both recovery and confirmation links log the user in (matches GoTrue).
  // The update-password screen then works off the normal session.
  await withServiceRole((c) =>
    c.query(
      `update auth.users
         set recovery_token = '', confirmation_token = '',
             email_confirmed_at = coalesce(email_confirmed_at, now())
       where id = $1`,
      [row.id]
    )
  );
  await createSession({ id: row.id, email: row.email });
  return { data: {}, error: null };
}

// ---- updateUser (password change) -----------------------------------

export async function updateUser(attrs: {
  password?: string;
}): Promise<{ data: { user: { id: string } | null }; error: AuthError }> {
  const session = await readSession();
  if (!session) {
    return { data: { user: null }, error: { message: "Not authenticated", code: "not_authenticated" } };
  }

  if (attrs.password !== undefined) {
    if (attrs.password.length < 8) {
      return { data: { user: null }, error: { message: "Password is too short", code: "weak_password" } };
    }
    const hash = await hashPassword(attrs.password);
    await withServiceRole((c) =>
      c.query(
        "update auth.users set encrypted_password = $2, updated_at = now(), recovery_token = '' where id = $1",
        [session.sub, hash]
      )
    );
  }
  return { data: { user: { id: session.sub } }, error: null };
}
