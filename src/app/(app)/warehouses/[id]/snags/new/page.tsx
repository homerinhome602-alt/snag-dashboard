import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/data/server";
import { isEffectiveAdmin } from "@/lib/roles";
import { AddSnagForm } from "./add-snag-form";

export default async function NewSnagPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;

  const [{ data: warehouse }, { data: membership }, { data: me }] = await Promise.all([
    supabase.from("warehouses").select("id, name").eq("id", id).single(),
    supabase.from("warehouse_members").select("role").eq("warehouse_id", id).eq("user_id", uid ?? ""),
    supabase.from("profiles").select("is_dashboard_admin, is_active").eq("id", uid ?? "").maybeSingle(),
  ]);

  if (!warehouse) notFound();

  // Any tagged member (or Dashboard Admin) may raise/import now — roles no
  // longer gate this. membership's own RLS already excludes a deactivated
  // member's rows, so only the admin half needs isEffectiveAdmin(me).
  const isMember = (membership ?? []).length > 0 || isEffectiveAdmin(me);
  if (!isMember || !uid) {
    redirect(`/warehouses/${id}`);
  }

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 sm:py-8 lg:px-[50px]">
      <div className="rounded-card border border-border bg-card p-5 sm:p-7">
        <h1 className="text-[15px] font-medium tracking-[-0.015em] text-foreground">
          Raise a snag
        </h1>
        <p className="mb-4 mt-0.5 text-[12px] text-muted-foreground">{warehouse.name}</p>
        <AddSnagForm warehouseId={id} warehouseName={warehouse.name} currentUserId={uid} />
      </div>
    </div>
  );
}
