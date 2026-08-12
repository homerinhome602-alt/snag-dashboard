import { Button } from "@/components/ui/button";
import { signInWithGoogle } from "./actions";

const THERMOMETER = ["#DCEAEE", "#E4EBEA", "#EDEAE5", "#F5E7E0", "#FBE4DE", "#F2C7BB", "#E89484", "#C75B4E"];

const ERROR_COPY: Record<string, { title: string; body: string }> = {
  not_invited: {
    title: "This Google account isn't set up yet",
    body: "We don't have an invitation for that address. Ask your dashboard admin to add it, then sign in with that exact Google account.",
  },
  oauth_unavailable: {
    title: "Sign-in is unavailable right now",
    body: "Something went wrong starting Google sign-in. Try again in a moment.",
  },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorInfo = error ? ERROR_COPY[error] : undefined;

  return (
    <div className="flex flex-1 items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-[340px] overflow-hidden rounded-card border border-border bg-card">
        <div className="flex">
          {THERMOMETER.map((c, i) => (
            <span key={i} className="h-1.5 flex-1" style={{ background: c }} />
          ))}
        </div>
        <div className="p-6">
          <h1 className="text-[17px] leading-tight text-foreground">
            Frozen warehouse
            <br />
            launch readiness
          </h1>
          <p className="mt-1 mb-5 text-sm text-muted-foreground">Sign in to continue</p>

          {errorInfo && (
            <div className="mb-4 rounded-md bg-accent p-3">
              <p className="text-[12.5px] font-medium text-accent-foreground">{errorInfo.title}</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-accent-foreground">{errorInfo.body}</p>
            </div>
          )}

          <form action={signInWithGoogle}>
            <Button type="submit" variant="outline" className="w-full gap-2.5">
              <GoogleIcon />
              Continue with Google
            </Button>
          </form>

          <p className="mt-4 text-center text-[12px] leading-relaxed text-muted-foreground">
            Sign in with the exact Google account your dashboard admin invited — a different address won&apos;t match.
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6c-2.1 1.6-4.7 2.6-7.7 2.6-5.2 0-9.6-3.3-11.3-7.9l-6.6 5.1C9.6 39.6 16.3 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.7l6.6 5.6C41.5 36 44 30.5 44 24c0-1.3-.1-2.7-.4-3.5z" />
    </svg>
  );
}
