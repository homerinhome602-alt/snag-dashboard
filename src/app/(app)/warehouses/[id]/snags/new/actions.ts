"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RaiseSnagInput = {
  description: string;
  category: string;
  subCategory: string;
  subCategoryOther: string | null;
  location: string;
  scope: string;
  severity: string;
};

export type DuplicateCandidate = {
  id: string;
  serial_no: number;
  description: string;
  status: string;
  raised_by_name: string | null;
};

export async function findSimilarSnags(
  warehouseId: string,
  location: string,
  subCategory: string,
  description: string
): Promise<DuplicateCandidate[]> {
  if (!description.trim()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("find_similar_snags", {
    p_warehouse_id: warehouseId,
    p_location: location,
    p_sub_category: subCategory,
    p_description: description,
  });

  if (error || !data) return [];
  return data as DuplicateCandidate[];
}

export async function raiseSnag(
  warehouseId: string,
  input: RaiseSnagInput,
  suppressedDuplicateIds: string[] = []
): Promise<{ snagId: string | null; serialNo: number | null; error: string | null }> {
  if (!input.description || !input.category || !input.subCategory || !input.location || !input.scope || !input.severity) {
    return { snagId: null, serialNo: null, error: "All fields are required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("raise_snag", {
      p_warehouse_id: warehouseId,
      p_description: input.description,
      p_category: input.category,
      p_sub_category: input.subCategory,
      p_sub_category_other: input.subCategoryOther,
      p_location: input.location,
      p_scope: input.scope,
      p_severity: input.severity,
      p_suppressed_duplicate_ids: suppressedDuplicateIds.length ? suppressedDuplicateIds : null,
    })
    .select()
    .single();

  if (error) {
    return { snagId: null, serialNo: null, error: error.message };
  }

  revalidatePath(`/warehouses/${warehouseId}`);
  const row = data as { id: string; serial_no: number };
  return { snagId: row.id, serialNo: row.serial_no, error: null };
}
