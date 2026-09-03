import type { PoolClient } from "pg";
import { pool } from "./pool";

// Every query runs inside one of these scopes. The scope checks out a client,
// switches into the matching Postgres role, and (for a signed-in user) publishes
// the JWT-claims GUC that private.auth_uid() / the RLS policies read. This is
// what keeps the schema's own row-security in force after Supabase is gone —
// nothing in the app re-implements visibility rules.

export type Scope = "anon" | "authenticated" | "service_role";

type RunFn<T> = (client: PoolClient) => Promise<T>;

async function runInScope<T>(
  scope: Scope,
  claims: Record<string, unknown> | null,
  fn: RunFn<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${scope}`);
    // set_config(..., true) => transaction-local, cleared on commit/rollback
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      claims ? JSON.stringify(claims) : "",
    ]);
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* ignore rollback failure */
    }
    throw err;
  } finally {
    client.release();
  }
}

export function withUser<T>(userId: string, fn: RunFn<T>): Promise<T> {
  return runInScope("authenticated", { sub: userId, role: "authenticated" }, fn);
}

export function withAnon<T>(fn: RunFn<T>): Promise<T> {
  return runInScope("anon", { role: "anon" }, fn);
}

// Bypasses RLS (service_role has BYPASSRLS). Used only by trusted server paths
// that must act outside any one user's visibility — e.g. the invitation lookup
// during sign-up, mirroring what Supabase's service key did.
export function withServiceRole<T>(fn: RunFn<T>): Promise<T> {
  return runInScope("service_role", { role: "service_role" }, fn);
}

// Convenience: pick the scope from an optional user id.
export function withOptionalUser<T>(
  userId: string | null | undefined,
  fn: RunFn<T>
): Promise<T> {
  return userId ? withUser(userId, fn) : withAnon(fn);
}
