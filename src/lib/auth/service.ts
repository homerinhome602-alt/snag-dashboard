import { randomUUID } from "crypto";
import { withServiceRole } from "@/lib/db/scope";
import { createSession, clearSession, readSession, type SessionClaims } from "./session";

type AuthError = { message: string; code?: string } | null;

// Creates a real profile (+ warehouse_members, if invited) for an email with
// no profile yet. Sign-in is open to any email — there is no invitation
// gate (db/10_schema.sql's handle_new_user() no longer raises for an
// uninvited email, it just creates a bare profile with no role/warehouses).
// A matching invitations row, if any, is what supplies a role, warehouse
// tags, or Dashboard Admin. Used both right at invite time (so an invited
// person is "active" immediately — see provisionInvitedUser below) and as
// the normal path for someone signing in cold, with no invitation at all.
// Inserting into auth.users fires on_auth_user_created / handle_new_user().
async function provisionProfile(
  email: string
): Promise<{ id: string; error?: undefined } | { id?: undefined; error: { message: string; code: string } }> {
  const id = randomUUID();
  try {
    await withServiceRole((c) => c.query("insert into auth.users (id, email) values ($1, $2)", [id, email]));
  } catch (e) {
    const err = e as { message?: string };
    return { error: { message: err.message ?? String(e), code: "unknown" } };
  }
  return { id };
}

// ---- sign in (email only, no password) ---------------------------------

export async function signInWithEmail(
  emailInput: string
): Promise<{ data: { user: { id: string; email: string } | null }; error: AuthError }> {
  const email = emailInput.trim().toLowerCase();
  if (!email) {
    return { data: { user: null }, error: { message: "Email is required", code: "missing_email" } };
  }

  // Deactivation is not a sign-in block (Sep 2026) — a deactivated person
  // still gets a session and lands on the dashboard, they just see nothing
  // there. private.is_active_user() (db/10_schema.sql) is what actually
  // enforces this, gating every RLS policy and SECURITY DEFINER RPC — so
  // there is nothing to check here beyond "does a profile exist".
  const existing = await withServiceRole((c) =>
    c
      .query<{ id: string; email: string }>("select id, email from public.profiles where lower(email) = $1", [email])
      .then((r) => r.rows[0] ?? null)
  );

  if (existing) {
    await createSession({ id: existing.id, email: existing.email });
    return { data: { user: { id: existing.id, email: existing.email } }, error: null };
  }

  // No profile yet, and no invitation gate any more — provision a bare
  // profile (no role, no warehouse_members, no admin) and sign them in. If
  // they were actually invited, provisionProfile picks that up too.
  const result = await provisionProfile(email);
  if (result.error) {
    return { data: { user: null }, error: result.error };
  }

  await createSession({ id: result.id, email });
  return { data: { user: { id: result.id, email } }, error: null };
}

// ---- provision at invite time (so status is active immediately) --------

export async function provisionInvitedUser(
  emailInput: string
): Promise<{ data: { user: { id: string; email: string } | null }; error: AuthError }> {
  const email = emailInput.trim().toLowerCase();
  const result = await provisionProfile(email);
  if (result.error) {
    return { data: { user: null }, error: result.error };
  }
  return { data: { user: { id: result.id, email } }, error: null };
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
