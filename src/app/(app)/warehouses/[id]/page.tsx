import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function WarehouseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: w } = await supabase
    .from("warehouse_readiness")
    .select("id, name, go_live_date, total_raised, open_count, open_high_count")
    .eq("id", id)
    .single();

  if (!w) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-[16px] font-medium tracking-[-0.015em] text-foreground">{w.name}</h1>
        <span className="font-mono text-[11px] text-faint">
          {w.go_live_date
            ? `GO-LIVE ${new Date(w.go_live_date + "T00:00:00").toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              }).toUpperCase()}`
            : "GO-LIVE NOT SET"}
        </span>
      </div>

      <div className="mb-4 grid grid-cols-4 gap-2">
        <div className="rounded-md border border-border bg-card p-2.5">
          <div className="font-mono text-[19px]">{w.total_raised}</div>
          <div className="text-[9px] text-faint">raised</div>
        </div>
        <div className="rounded-md border border-border bg-card p-2.5">
          <div className="font-mono text-[19px]">{w.open_count}</div>
          <div className="text-[9px] text-faint">open</div>
        </div>
        <div className="rounded-md border border-border bg-card p-2.5">
          <div className="font-mono text-[19px]">{w.total_raised - w.open_count}</div>
          <div className="text-[9px] text-faint">closed</div>
        </div>
        <div className="rounded-md border border-blush bg-blush p-2.5">
          <div className="font-mono text-[19px] text-red-deep">{w.open_high_count}</div>
          <div className="text-[9px] text-red-deep">open high</div>
        </div>
      </div>

      <p className="text-[12.5px] text-muted-foreground">
        The team block, burn-up chart, and snag table land in Phase 3/4.
      </p>
    </div>
  );
}
