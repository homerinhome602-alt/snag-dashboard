import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { REPORTER_ROLES } from "@/lib/roles";
import { ImportForm } from "./import-form";

export default async function ImportSnagsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;

  const [{ data: warehouse }, { data: membership }] = await Promise.all([
    supabase.from("warehouses").select("id, name").eq("id", id).single(),
    supabase.from("warehouse_members").select("role").eq("warehouse_id", id).eq("user_id", uid ?? ""),
  ]);

  if (!warehouse) notFound();

  const isReporter = (membership ?? []).some((m) => REPORTER_ROLES.includes(m.role));
  if (!isReporter) {
    redirect(`/warehouses/${id}`);
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <div className="rounded-card border border-border bg-card p-5">
        <h1 className="text-[15px] font-medium tracking-[-0.015em] text-foreground">
          Import snags
        </h1>
        <p className="mb-4 mt-0.5 text-[12px] text-muted-foreground">{warehouse.name}</p>
        <ImportForm warehouseId={id} />
      </div>
    </div>
  );
}
