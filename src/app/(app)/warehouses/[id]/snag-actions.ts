"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function postSnagUpdate(
  warehouseId: string,
  snagId: string,
  body: string,
  etcDate: string | null,
  status: string | null
): Promise<{ error: string | null }> {
  if (!body.trim()) {
    return { error: "Update text is required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("post_snag_update", {
    p_snag_id: snagId,
    p_body: body.trim(),
    p_etc_date: etcDate || null,
    p_status: status || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/warehouses/${warehouseId}`);
  return { error: null };
}

export async function verifySnagClosure(
  warehouseId: string,
  snagId: string,
  approved: boolean
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("verify_snag_closure", {
    p_snag_id: snagId,
    p_approved: approved,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/warehouses/${warehouseId}`);
  return { error: null };
}
