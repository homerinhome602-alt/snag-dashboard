import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AddWarehouseForm } from "./add-warehouse-form";

export default async function NewWarehousePage() {
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

  const { data: people } = await supabase
    .from("profiles")
    .select("id, full_name, email, default_role")
    .eq("is_active", true)
    .order("full_name");

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6 sm:max-w-3xl sm:px-6 sm:py-8 lg:max-w-4xl">
      <div className="rounded-card border border-border bg-card p-5 sm:p-7">
        <h1 className="text-[15px] font-medium tracking-[-0.015em] text-foreground">
          Create warehouse
        </h1>
        <p className="mb-4 mt-0.5 text-[12px] text-muted-foreground">
          Tag the people who&apos;ll work on it. Each role can hold more than one person.
        </p>
        <AddWarehouseForm people={people ?? []} currentUserId={uid} />
        <p className="mt-4 border-t border-line-soft pt-3 text-[12px] text-muted-foreground">
          The go-live date is set later, from the warehouse screen, by anyone in a resolver role.
        </p>
      </div>
    </div>
  );
}
