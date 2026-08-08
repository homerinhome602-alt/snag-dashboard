import { createClient } from "@/lib/supabase/server";
import { WarehouseCard } from "@/components/warehouse-card";
import { daysUntil, nextToLaunch, sortByLaunchProximity, type WarehouseReadiness } from "@/lib/readiness";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("warehouse_readiness")
    .select("id, name, go_live_date, total_raised, open_count, open_high_count");

  const warehouses = (data ?? []) as WarehouseReadiness[];
  const sorted = sortByLaunchProximity(warehouses);
  const next = nextToLaunch(warehouses);
  const nextDays = next ? daysUntil(next.go_live_date) : null;

  const totals = warehouses.reduce(
    (acc, w) => ({
      open: acc.open + w.open_count,
      openHigh: acc.openHigh + w.open_high_count,
      raised: acc.raised + w.total_raised,
    }),
    { open: 0, openHigh: 0, raised: 0 }
  );

  if (warehouses.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        No warehouses yet. Use &ldquo;Warehouse management&rdquo; in the sidebar to create the first one.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 sm:py-8 lg:px-[100px]">
      <div className="mb-4 flex items-center gap-6 rounded-card border border-border bg-card p-3.5">
        <div>
          <div className="font-mono text-[22px] leading-none">{totals.open}</div>
          <div className="text-[9px] uppercase tracking-[0.06em] text-faint">Open</div>
        </div>
        <div>
          <div className="font-mono text-[22px] leading-none" style={{ color: "#C75B4E" }}>
            {totals.openHigh}
          </div>
          <div className="text-[9px] uppercase tracking-[0.06em] text-faint">Open high</div>
        </div>
        <div>
          <div className="font-mono text-[22px] leading-none">{totals.raised}</div>
          <div className="text-[9px] uppercase tracking-[0.06em] text-faint">Raised</div>
        </div>
        <div className="flex-1" />
        {next && (
          <div className="max-w-[230px] text-right text-[12px] leading-relaxed text-muted-foreground">
            Next to launch — <b className="font-medium text-foreground">{next.name}</b> opens in{" "}
            {nextDays} days with {next.open_count} snags still open
          </div>
        )}
      </div>

      <div className="mb-2.5 text-[11px] uppercase tracking-[0.07em] text-faint">
        {warehouses.length} warehouse{warehouses.length === 1 ? "" : "s"} · soonest launch first
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {sorted.map((w) => (
          <WarehouseCard key={w.id} w={w} />
        ))}
      </div>
    </div>
  );
}
