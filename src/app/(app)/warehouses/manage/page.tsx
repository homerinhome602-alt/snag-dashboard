import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WarehouseCodeManager } from "./warehouse-code-manager";
import type { WarehouseActivityRow } from "./warehouse-row";

export default async function WarehouseManagementPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;

  const { data: me } = await supabase
    .from("profiles")
    .select("is_dashboard_admin")
    .eq("id", uid)
    .single();

  if (!me?.is_dashboard_admin || !uid) {
    redirect("/");
  }

  const [{ data: warehouses }, { data: activity }] = await Promise.all([
    supabase.from("warehouses").select("id, name, is_active").order("name"),
    supabase
      .from("warehouse_activity")
      .select("id, warehouse_id, action, field, old_value, new_value, created_at, actor:profiles(full_name, email)")
      .order("created_at"),
  ]);

  const activityByWarehouse: Record<string, WarehouseActivityRow[]> = {};
  for (const a of activity ?? []) {
    const key = (a as { warehouse_id: string }).warehouse_id;
    (activityByWarehouse[key] ??= []).push(a as unknown as WarehouseActivityRow);
  }

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 sm:py-8 lg:px-[50px]">
      <h1 className="mb-4 text-[17px] text-foreground">Warehouse management</h1>
      <WarehouseCodeManager warehouses={warehouses ?? []} activityByWarehouse={activityByWarehouse} />
    </div>
  );
}
