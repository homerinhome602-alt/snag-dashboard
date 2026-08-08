import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInWithGoogle, signInWithPassword } from "./actions";

const THERMOMETER = ["#DCEAEE", "#E4EBEA", "#EDEAE5", "#F5E7E0", "#FBE4DE", "#F2C7BB", "#E89484", "#C75B4E"];

const ERROR_COPY: Record<string, { title: string; body: string }> = {
  not_invited: {
    title: "This email isn't set up yet",
    body: "We don't have an invitation for that address. Ask your dashboard admin to add it, then sign in with that exact address.",
  },
  invalid_credentials: {
    title: "Couldn't sign you in",
    body: "That email and password combination doesn't match an account.",
  },
  oauth_failed: {
    title: "Couldn't connect to Google",
    body: "Something went wrong starting the Google sign-in. Try again.",
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
              <p className="mt-1 text-[11.5px] leading-relaxed text-accent-foreground">
                {errorInfo.body}
              </p>
            </div>
          )}

          <form action={signInWithGoogle}>
            <Button type="submit" variant="outline" className="w-full">
              Continue with Google
            </Button>
          </form>

          <div className="my-4 flex items-center gap-2">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] text-faint">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <form action={signInWithPassword} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
                Work email
              </Label>
              <Input id="email" name="email" type="email" placeholder="priya@company.com" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className="text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
                Password
              </Label>
              <Input id="password" name="password" type="password" required />
            </div>
            <Button type="submit" className="mt-1 w-full">
              Sign in
            </Button>
          </form>

          <p className="mt-3 text-center text-[13px] text-muted-foreground">
            <a href="/forgot-password" className="hover:text-foreground">
              Forgot your password?
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
