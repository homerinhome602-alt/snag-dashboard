"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/lib/roles";

export async function createInvitation(formData: FormData) {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const defaultRole = formData.get("default_role") as MemberRole;
  const grantDashboardAdmin = formData.get("grant_dashboard_admin") === "yes";
  const warehouseIds = formData.getAll("warehouse_ids") as string[];

  if (!email || !defaultRole) {
    return { error: "Email and a role are required." };
  }

  const supabase = await createClient();

  // handle_new_user() only ever runs on someone's first sign-in — once
  // they have a profile, editing this invitation has no effect on their
  // real access. Say so instead of silently upserting a value that will
  // never take effect.
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingProfile) {
    return {
      error:
        "This person has already signed in, so their role, warehouse, and admin status can't be changed here — there's currently no way to edit an existing member's access.",
    };
  }

  const { data: auth } = await supabase.auth.getClaims();
  const invitedBy = auth?.claims?.sub;

  const { error } = await supabase.from("invitations").upsert(
    {
      email,
      default_role: defaultRole,
      grant_dashboard_admin: grantDashboardAdmin,
      warehouse_ids: warehouseIds,
      invited_by: invitedBy,
    },
    { onConflict: "email" }
  );

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
