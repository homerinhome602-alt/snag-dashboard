"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requestPasswordReset(formData: FormData) {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  if (!email) {
    redirect("/forgot-password");
  }

  const supabase = await createClient();
  const origin = (await headers()).get("origin");

  // Supabase never reveals whether an email is registered, so the caller
  // always sees the same "check your email" message regardless of this
  // result — don't branch the UI on error/success here.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/update-password`,
  });

  redirect("/forgot-password?sent=1");
}
