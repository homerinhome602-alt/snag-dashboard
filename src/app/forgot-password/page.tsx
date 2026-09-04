import { cookies } from "next/headers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "./actions";

const THERMOMETER = ["#DCEAEE", "#E4EBEA", "#EDEAE5", "#F5E7E0", "#FBE4DE", "#F2C7BB", "#E89484", "#C75B4E"];

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;
  const devResetLink = sent ? (await cookies()).get("dev_reset_link")?.value : undefined;

  return (
    <div className="flex flex-1 items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-[340px] overflow-hidden rounded-card border border-border bg-card">
        <div className="flex">
          {THERMOMETER.map((c, i) => (
            <span key={i} className="h-1.5 flex-1" style={{ background: c }} />
          ))}
        </div>
        <div className="p-6">
          <h1 className="text-[17px] leading-tight text-foreground">Reset your password</h1>
          <p className="mt-1 mb-5 text-[13px] text-muted-foreground">
            We&apos;ll email you a link to choose a new one.
          </p>

          {error === "invalid_or_expired" && (
            <div className="mb-4 rounded-md bg-accent p-3">
              <p className="text-[12.5px] font-medium text-accent-foreground">That link didn&apos;t work</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-accent-foreground">
                It may have expired or already been used. Request a new one below.
              </p>
            </div>
          )}

          {sent ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-md bg-mint p-3">
                <p className="text-[12.5px] font-medium text-mint-deep">Check your email</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-mint-deep">
                  If an account exists for that address, a reset link is on its way.
                </p>
              </div>
              {devResetLink && (
                <div className="rounded-md border border-border bg-muted/40 p-3">
                  <p className="text-[10.5px] font-medium uppercase tracking-[0.07em] text-faint">
                    Dev mode — no mailbox
                  </p>
                  <p className="mt-1 text-[11.5px] text-muted-foreground">
                    Email isn&apos;t configured (<code>MAIL_PROVIDER=console</code>). Use this link to
                    set a new password:
                  </p>
                  <a
                    href={devResetLink}
                    className="mt-1.5 block break-all text-[11.5px] text-coral hover:underline"
                  >
                    {devResetLink}
                  </a>
                </div>
              )}
            </div>
          ) : (
            <form action={requestPasswordReset} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email" className="text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
                  Work email
                </Label>
                <Input id="email" name="email" type="email" placeholder="priya@company.com" required />
              </div>
              <Button type="submit" className="mt-1 w-full">
                Send reset link
              </Button>
            </form>
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
