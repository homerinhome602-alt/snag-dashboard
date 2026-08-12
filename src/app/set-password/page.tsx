import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setPassword } from "./actions";

const THERMOMETER = ["#DCEAEE", "#E4EBEA", "#EDEAE5", "#F5E7E0", "#FBE4DE", "#F2C7BB", "#E89484", "#C75B4E"];

const ERROR_COPY: Record<string, { title: string; body: string }> = {
  missing_fields: {
    title: "Missing information",
    body: "Fill in every field before submitting.",
  },
  not_invited: {
    title: "This email isn't set up yet",
    body: "We don't have an invitation for that address. Ask your dashboard admin to add it, then come back with that exact address.",
  },
  already_exists: {
    title: "This email already has an account",
    body: "Sign in instead, or use Forgot password if that account needs a password set.",
  },
  password_mismatch: {
    title: "Passwords don't match",
    body: "Type the same password in both fields.",
  },
  weak_password: {
    title: "Choose a stronger password",
    body: "That password is too easy to guess. Try something longer or less common.",
  },
};

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error, success } = await searchParams;
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
          <h1 className="text-[17px] leading-tight text-foreground">Set your password</h1>
          <p className="mt-1 mb-5 text-sm text-muted-foreground">
            For people invited by email who don&apos;t sign in with Google.
          </p>

          {success ? (
            <div className="rounded-md bg-mint p-3">
              <p className="text-[12.5px] font-medium text-mint-deep">Almost there</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-mint-deep">
                Check your email to confirm your address, then sign in.
              </p>
            </div>
          ) : (
            <>
              {errorInfo && (
                <div className="mb-4 rounded-md bg-accent p-3">
                  <p className="text-[12.5px] font-medium text-accent-foreground">{errorInfo.title}</p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-accent-foreground">{errorInfo.body}</p>
                </div>
              )}

              <form action={setPassword} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="full_name" className="text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
                    Full name
                  </Label>
                  <Input id="full_name" name="full_name" type="text" required />
                </div>
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
                  <Input id="password" name="password" type="password" minLength={8} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="confirm_password" className="text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
                    Confirm password
                  </Label>
                  <Input id="confirm_password" name="confirm_password" type="password" minLength={8} required />
                </div>
                <Button type="submit" className="mt-1 w-full">
                  Set password
                </Button>
              </form>
            </>
          )}

          <p className="mt-3 text-center text-[13px] text-muted-foreground">
            <a href="/login" className="hover:text-foreground">
              Back to sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
