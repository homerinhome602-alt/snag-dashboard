"use server";

import { createClient } from "@/lib/supabase/server";

export async function createWarehouse(
  name: string,
  siteLocation: string,
  members: { user_id: string; role: string }[]
): Promise<{ id: string | null; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("create_warehouse", {
      p_name: name,
      p_site_location: siteLocation || null,
      p_members: members,
    })
    .select()
    .single();

  if (error) {
    return { id: null, error: error.message };
  }

  return { id: (data as { id: string }).id, error: null };
}
