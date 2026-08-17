"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/lib/roles";
import { DASHBOARD_ADMIN_VALUE } from "@/lib/roles";

export async function createInvitation(formData: FormData) {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const role = formData.get("role") as string;

  if (!email || !role) {
    return { error: "Email and a role are required." };
  }

  // Dashboard Admin is mutually exclusive with an operational role here —
  // picking it means no default_role and no warehouse tagging, since
  // admin's powers are global, not warehouse-scoped (PLAN.md §2.2).
  const isAdminPick = role === DASHBOARD_ADMIN_VALUE;
  const defaultRole = isAdminPick ? null : (role as MemberRole);
  const grantDashboardAdmin = isAdminPick;
  const warehouseIds = isAdminPick ? [] : (formData.getAll("warehouse_ids") as string[]);

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

// Adds warehouse_members rows for someone who has already signed in — the
// gap CLAUDE.md documents (handle_new_user only runs on first sign-in, so
// re-inviting has no effect on real access). This is deliberately additive
// only: it can tag a new warehouse+role pair, not change or remove an
// existing tag or touch admin status — see the "no way to edit an existing
// member" gotcha for why that's out of scope here.
export async function addWarehouseMembership(
  userId: string,
  role: MemberRole,
  warehouseIds: string[]
) {
  if (!role || warehouseIds.length === 0) {
    return { error: "Pick a role and at least one warehouse." };
  }

  const supabase = await createClient();
  const rows = warehouseIds.map((warehouse_id) => ({ warehouse_id, user_id: userId, role }));

  // Re-adding a pair that's already there is a no-op, not an error — the
  // unique constraint is (warehouse_id, user_id, role).
  const { error } = await supabase
    .from("warehouse_members")
    .upsert(rows, { onConflict: "warehouse_id,user_id,role", ignoreDuplicates: true });

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
