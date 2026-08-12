"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updatePassword(formData: FormData) {
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirm_password") as string;

  if (password !== confirmPassword) {
    redirect("/auth/update-password?error=password_mismatch");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(`/auth/update-password?error=${error.code === "weak_password" ? "weak_password" : "unknown"}`);
  }

  revalidatePath("/", "layout");
  redirect("/");
}
