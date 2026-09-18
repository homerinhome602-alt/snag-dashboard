import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInWithEmail } from "./actions";

const THERMOMETER = ["#DCEAEE", "#E4EBEA", "#EDEAE5", "#F5E7E0", "#FBE4DE", "#F2C7BB", "#E89484", "#C75B4E"];

// Sign-in has no invitation gate and no deactivation gate — any email gets
// in, active or deactivated; access to warehouses is governed separately
// (private.is_active_user() + warehouse tagging, db/10_schema.sql). The only
// ways this can fail:
const ERROR_COPY: Record<string, { title: string; body: string }> = {
  missing_email: {
    title: "Enter your email",
    body: "An email address is required to sign in.",
  },
  unknown: {
    title: "Couldn't sign you in",
    body: "Something went wrong. Try again in a moment.",
  },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorInfo = error ? ERROR_COPY[error] ?? ERROR_COPY.unknown : undefined;

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
          <p className="mt-1 mb-5 text-[13px] text-muted-foreground">Sign in to continue</p>

          {errorInfo && (
            <div className="mb-4 rounded-md bg-accent p-3">
              <p className="text-[12.5px] font-medium text-accent-foreground">{errorInfo.title}</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-accent-foreground">
                {errorInfo.body}
              </p>
            </div>
          )}

          <form action={signInWithEmail} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
                Email
              </Label>
              <Input id="email" name="email" type="email" placeholder="priya@company.com" required />
            </div>
            <Button type="submit" className="mt-1 w-full">
              Sign In
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
