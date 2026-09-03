import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db/scope";
import { RpcBuilder } from "@/lib/pgrest/builder";

// Client components can only reach the database through here, and only for the
// RPCs the offline-sync path actually needs. Everything else runs server-side.
const CLIENT_CALLABLE = new Set(["raise_snag"]);

export async function POST(request: Request) {
  const claims = await readSession();
  if (!claims) return NextResponse.json({ error: { message: "not authenticated" } }, { status: 401 });

  let body: { fn?: string; args?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "invalid JSON" } }, { status: 400 });
  }

  const fn = body.fn ?? "";
  if (!CLIENT_CALLABLE.has(fn)) {
    return NextResponse.json({ error: { message: `rpc "${fn}" is not callable from the client` } }, { status: 403 });
  }

  const { data, error } = await new RpcBuilder(
    (f) => withUser(claims.sub, f),
    fn,
    body.args ?? {}
  );
  return NextResponse.json({ data, error });
}
