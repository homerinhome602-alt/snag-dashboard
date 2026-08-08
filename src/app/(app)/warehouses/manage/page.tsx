import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ManagementTabs } from "./management-tabs";

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

  const [{ data: people }, { data: warehouses }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, default_role").eq("is_active", true).order("full_name"),
    supabase.from("warehouses").select("id, name").order("name"),
  ]);

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6 sm:max-w-3xl sm:px-6 sm:py-8 lg:max-w-4xl">
      <div className="rounded-card border border-border bg-card p-5 sm:p-7">
        <h1 className="mb-4 text-[15px] font-medium tracking-[-0.015em] text-foreground">
          Warehouse management
        </h1>
        <ManagementTabs people={people ?? []} warehouses={warehouses ?? []} currentUserId={uid} />
      </div>
    </div>
  );
}
