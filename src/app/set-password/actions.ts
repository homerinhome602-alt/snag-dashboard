"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function setPassword(formData: FormData) {
  const fullName = (formData.get("full_name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirm_password") as string;

  if (!fullName || !email || !password) {
    redirect("/set-password?error=missing_fields");
  }
  if (password !== confirmPassword) {
    redirect("/set-password?error=password_mismatch");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (error) {
    if (error.code === "weak_password") {
      redirect("/set-password?error=weak_password");
    }
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      redirect("/set-password?error=already_exists");
    }
    // The invitation-gate trigger raises a Postgres exception for an
    // unmatched email; Supabase surfaces that as a generic signup
    // failure rather than a distinct code, so once weak-password and
    // duplicate-account are ruled out, "not invited" is the only
    // realistic remaining cause.
    redirect("/set-password?error=not_invited");
  }

  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/");
  }

  redirect("/set-password?success=1");
}
