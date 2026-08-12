import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePassword } from "./actions";

const ERROR_COPY: Record<string, string> = {
  password_mismatch: "Those passwords don't match.",
  weak_password: "That password is too easy to guess. Try something longer or less common.",
  unknown: "Something went wrong. Try requesting a new reset link.",
};

export default async function UpdatePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  // Only reachable with the recovery session /auth/confirm just set —
  // no session here means the link was invalid, expired, or already used.
  if (!data?.claims) {
    redirect("/forgot-password?error=invalid_or_expired");
  }

  const { error } = await searchParams;
  const errorCopy = error ? ERROR_COPY[error] : undefined;

  return (
    <div className="flex flex-1 items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-[340px] overflow-hidden rounded-card border border-border bg-card">
        <div className="p-6">
          <h1 className="text-[17px] leading-tight text-foreground">Set a new password</h1>
          <p className="mt-1 mb-5 text-sm text-muted-foreground">Choose a new password for your account.</p>

          {errorCopy && (
            <div className="mb-4 rounded-md bg-accent p-3">
              <p className="text-[12.5px] text-accent-foreground">{errorCopy}</p>
            </div>
          )}

          <form action={updatePassword} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className="text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
                New password
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
              Update password
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
