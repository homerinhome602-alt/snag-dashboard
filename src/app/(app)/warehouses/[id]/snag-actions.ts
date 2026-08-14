"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function postSnagUpdate(
  warehouseId: string,
  snagId: string,
  body: string,
  actingAs: "reporter" | "resolver",
  etcDate: string | null,
  status: string | null
): Promise<{ updateId: string | null; error: string | null }> {
  if (!body.trim()) {
    return { updateId: null, error: "Update text is required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("post_snag_update", {
      p_snag_id: snagId,
      p_body: body.trim(),
      p_etc_date: etcDate || null,
      p_status: status || null,
      p_acting_as: actingAs,
    })
    .select()
    .single();

  if (error) {
    return { updateId: null, error: error.message };
  }

  revalidatePath(`/warehouses/${warehouseId}`);
  return { updateId: (data as { id: string }).id, error: null };
}

export async function closeSnagDirectly(
  warehouseId: string,
  snagId: string,
  body: string | null
): Promise<{ updateId: string | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("close_snag_directly", { p_snag_id: snagId, p_body: body?.trim() || null })
    .select()
    .single();

  if (error) {
    return { updateId: null, error: error.message };
  }

  revalidatePath(`/warehouses/${warehouseId}`);
  return { updateId: (data as { update_id: string | null }).update_id, error: null };
}

export async function verifySnagClosure(
  warehouseId: string,
  snagId: string,
  approved: boolean,
  body: string | null
): Promise<{ updateId: string | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("verify_snag_closure", {
      p_snag_id: snagId,
      p_approved: approved,
      p_body: body?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    return { updateId: null, error: error.message };
  }

  revalidatePath(`/warehouses/${warehouseId}`);
  return { updateId: (data as { update_id: string | null }).update_id, error: null };
}
