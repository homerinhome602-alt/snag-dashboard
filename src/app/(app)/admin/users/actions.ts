"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/lib/roles";
import { DASHBOARD_ADMIN_VALUE, roleLabel } from "@/lib/roles";

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

  let detail = isAdminPick ? "Invited as Dashboard Admin" : `Invited as ${roleLabel(defaultRole)}`;
  if (warehouseIds.length > 0) {
    const { data: whs } = await supabase.from("warehouses").select("name").in("id", warehouseIds);
    const names = (whs ?? []).map((w) => w.name);
    if (names.length > 0) detail += `, tagged to ${names.join(", ")}`;
  }
  await supabase.from("people_activity").insert({ email, actor_id: invitedBy, action: "invited", detail });

  revalidatePath("/admin/users");
  return { error: null };
}

// Adds warehouse_members rows for someone who has already signed in — the
// gap CLAUDE.md documents (handle_new_user only runs on first sign-in, so
// re-inviting has no effect on real access). A person holds exactly one
// role, full stop — not chosen here, but read from profiles.default_role
// (set once at invite time and otherwise unused as anything but a sort
// hint elsewhere, but authoritative for this control). Every call
// re-derives the person's *entire* warehouse_members set from their
// current + newly-picked warehouses, all under that one role, so this
// also self-heals anyone left holding two different roles by an earlier
// version of this action that let the caller pass a role per call. Still
// can't remove a warehouse entirely or touch admin status — see the
// "no way to edit an existing member" gotcha.
export async function addWarehouseMembership(userId: string, newWarehouseIds: string[]) {
  if (newWarehouseIds.length === 0) {
    return { error: "Pick at least one warehouse." };
  }

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("default_role, email")
    .eq("id", userId)
    .maybeSingle();
  const role = profile?.default_role as MemberRole | null;

  if (!role) {
    return { error: "This person has no role on file, so they can't be tagged to a warehouse here." };
  }

  const { data: existingRows, error: readError } = await supabase
    .from("warehouse_members")
    .select("warehouse_id")
    .eq("user_id", userId);

  if (readError) {
    return { error: readError.message };
  }

  const warehouseIds = Array.from(
    new Set([...(existingRows ?? []).map((r) => r.warehouse_id), ...newWarehouseIds])
  );

  const { error: deleteError } = await supabase
    .from("warehouse_members")
    .delete()
    .eq("user_id", userId);

  if (deleteError) {
    return { error: deleteError.message };
  }

  const rows = warehouseIds.map((warehouse_id) => ({ warehouse_id, user_id: userId, role }));
  const { error } = await supabase.from("warehouse_members").insert(rows);

  if (error) {
    return { error: error.message };
  }

  if (profile?.email) {
    const { data: auth } = await supabase.auth.getClaims();
    const { data: newWhs } = await supabase.from("warehouses").select("name").in("id", newWarehouseIds);
    const names = (newWhs ?? []).map((w) => w.name).join(", ");
    await supabase.from("people_activity").insert({
      email: profile.email,
      actor_id: auth?.claims?.sub,
      action: "warehouse_added",
      detail: `Tagged to ${names}`,
    });
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
