"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createWarehouse(
  name: string,
  members: { user_id: string; role: string }[]
): Promise<{ id: string | null; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("create_warehouse", {
      p_name: name,
      p_site_location: null,
      p_members: members,
    })
    .select()
    .single();

  if (error) {
    return { id: null, error: error.message };
  }

  // Revalidate the whole layout tree, not just the current segment — the
  // sidebar's warehouse list lives in the shared (app) layout, and a plain
  // client-side router.push() to the new warehouse won't refetch it.
  revalidatePath("/", "layout");

  return { id: (data as { id: string }).id, error: null };
}

export async function getWarehouseMembers(
  warehouseId: string
): Promise<{ role: string; user_id: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("warehouse_members")
    .select("role, user_id")
    .eq("warehouse_id", warehouseId);
  return data ?? [];
}

export async function addWarehouseMembers(
  warehouseId: string,
  members: { user_id: string; role: string }[]
): Promise<{ error: string | null }> {
  if (members.length === 0) return { error: null };

  const supabase = await createClient();
  const { error } = await supabase.from("warehouse_members").insert(
    members.map((m) => ({ warehouse_id: warehouseId, user_id: m.user_id, role: m.role }))
  );

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

export async function removeWarehouseMember(
  warehouseId: string,
  role: string,
  userId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("warehouse_members")
    .delete()
    .eq("warehouse_id", warehouseId)
    .eq("role", role)
    .eq("user_id", userId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
