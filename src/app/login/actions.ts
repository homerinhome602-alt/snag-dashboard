"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/data/server";

export async function signInWithEmail(formData: FormData) {
  const supabase = await createClient();
  const email = formData.get("email") as string;

  const { error } = await supabase.auth.signInWithEmail(email);
  if (error) {
    redirect(`/login?error=${error.code ?? "unknown"}`);
  }

  revalidatePath("/", "layout");
  redirect("/");
}
