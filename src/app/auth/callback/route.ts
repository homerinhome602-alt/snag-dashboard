import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Handles the OAuth redirect from Google. Exchanging the code creates the
// Supabase auth.users row on a brand-new sign-in, which is exactly when the
// invitation-gate trigger (public.handle_new_user) can reject an uninvited
// email — surfaced here as an error rather than a session.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=not_invited`);
}
