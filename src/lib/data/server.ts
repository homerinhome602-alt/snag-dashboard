import { QueryBuilder, RpcBuilder, type Runner } from "@/lib/pgrest/builder";
import { withUser, withAnon } from "@/lib/db/scope";
import { readSession } from "@/lib/auth/session";
import * as auth from "@/lib/auth/service";
import { createSignedPath } from "@/lib/storage/local";

// Drop-in replacement for the old Supabase server client. Same call surface
// (`from`, `rpc`, `auth`, `storage`) — backed by a direct Postgres pool.
// Each query opens its own scoped transaction (role + JWT-claims GUC) so the
// schema's RLS policies stay in force exactly as they did under PostgREST.
export async function createClient() {
  const claims = await readSession();
  const runner: Runner = claims ? (fn) => withUser(claims.sub, fn) : (fn) => withAnon(fn);

  return {
    from(table: string) {
      return new QueryBuilder(runner, table);
    },
    rpc(fn: string, args: Record<string, unknown> = {}) {
      return new RpcBuilder(runner, fn, args);
    },
    auth: {
      getClaims: auth.getClaims,
      getUser: auth.getUser,
      signInWithEmail: auth.signInWithEmail,
      signOut: auth.signOut,
      provisionInvitedUser: auth.provisionInvitedUser,
    },
    storage: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      from(bucket: string) {
        return {
          async createSignedUrls(paths: string[], expiresIn: number) {
            return {
              data: paths.map((p) => ({ path: p, signedUrl: createSignedPath(p, expiresIn) })),
              error: null as null,
            };
          },
        };
      },
    },
  };
}
