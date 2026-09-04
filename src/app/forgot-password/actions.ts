"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/data/server";

export async function requestPasswordReset(formData: FormData) {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  if (!email) {
    redirect("/forgot-password");
  }

  const supabase = await createClient();
  const origin = (await headers()).get("origin");

  // Always show the same "check your email" result — never reveal whether the
  // address is registered.
  const { data } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/update-password`,
  });

  // Local dev (MAIL_PROVIDER=console): stash the link in a short-lived cookie so
  // the confirmation screen can show it — there is no real mailbox.
  if (data?.devLink) {
    const jar = await cookies();
    jar.set("dev_reset_link", data.devLink, {
      httpOnly: true,
      sameSite: "lax",
      path: "/forgot-password",
      maxAge: 300,
    });
  }

  redirect("/forgot-password?sent=1");
}
