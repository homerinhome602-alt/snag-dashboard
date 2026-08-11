"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createWarehouseCode(
  code: string
): Promise<{ id: string | null; error: string | null }> {
  const trimmed = code.trim();
  if (!trimmed) return { id: null, error: "Warehouse code can't be empty." };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const uid = auth?.claims?.sub;

  const { data, error } = await supabase
    .from("warehouses")
    .insert({ name: trimmed, created_by: uid })
    .select("id")
    .single();

  if (error) {
    return { id: null, error: error.message };
  }

  await supabase.from("warehouse_activity").insert({
    warehouse_id: data.id,
    actor_id: uid,
    action: "create",
  });

  // Revalidate the whole layout tree, not just the current segment — the
  // sidebar's warehouse list lives in the shared (app) layout, and a plain
  // client-side router.refresh() to this page won't refetch it.
  revalidatePath("/", "layout");

  return { id: data.id, error: null };
}

export async function setWarehouseActive(
  warehouseId: string,
  isActive: boolean
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const uid = auth?.claims?.sub;

  const { error } = await supabase
    .from("warehouses")
    .update({ is_active: isActive })
    .eq("id", warehouseId);

  if (error) {
    return { error: error.message };
  }

  await supabase.from("warehouse_activity").insert({
    warehouse_id: warehouseId,
    actor_id: uid,
    action: isActive ? "activate" : "deactivate",
    field: "is_active",
    old_value: String(!isActive),
    new_value: String(isActive),
  });

  revalidatePath("/", "layout");
  return { error: null };
}
