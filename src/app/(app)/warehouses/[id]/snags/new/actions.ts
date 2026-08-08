"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function raiseSnag(
  warehouseId: string,
  _prev: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const description = (formData.get("description") as string)?.trim();
  const category = formData.get("category") as string;
  const subCategory = formData.get("sub_category") as string;
  const subCategoryOther = (formData.get("sub_category_other") as string)?.trim() || null;
  const location = formData.get("location") as string;
  const scope = formData.get("scope") as string;
  const severity = formData.get("severity") as string;

  if (!description || !category || !subCategory || !location || !scope || !severity) {
    return { error: "All fields are required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("raise_snag", {
      p_warehouse_id: warehouseId,
      p_description: description,
      p_category: category,
      p_sub_category: subCategory,
      p_sub_category_other: subCategoryOther,
      p_location: location,
      p_scope: scope,
      p_severity: severity,
    })
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/warehouses/${warehouseId}`);
  redirect(`/warehouses/${warehouseId}?raised=${(data as { serial_no: number }).serial_no}`);
}
