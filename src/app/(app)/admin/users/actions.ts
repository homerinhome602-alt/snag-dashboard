"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/lib/roles";

export async function createInvitation(formData: FormData) {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const defaultRole = formData.get("default_role") as MemberRole;

  if (!email || !defaultRole) {
    return { error: "Email and a default role are required." };
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const invitedBy = auth?.claims?.sub;

  const { error } = await supabase
    .from("invitations")
    .upsert({ email, default_role: defaultRole, invited_by: invitedBy }, { onConflict: "email" });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/users");
  return { error: null };
}

export async function setUserActive(userId: string, isActive: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_user_active", {
    p_user_id: userId,
    p_is_active: isActive,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/users");
  return { error: null };
}
