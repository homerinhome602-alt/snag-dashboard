import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // The invitation-gate trigger raises a Postgres exception for a
  // first-time sign-in with no matching invitation, which surfaces here
  // as an exchange failure (or Google itself may redirect back with an
  // error instead of a code) — "not invited" is the only realistic cause
  // once a missing/invalid code is ruled out.
  return NextResponse.redirect(`${origin}/login?error=not_invited`);
}
