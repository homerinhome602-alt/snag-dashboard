// Launch-readiness gate thresholds (PLAN.md §5.2.1). Named constants so a
// future per-org settings screen can replace these without touching the
// formula itself.
export const OPEN_PCT_THRESHOLD = 0.25;
export const NEAR_LAUNCH_DAYS = 14;

export type WarehouseReadiness = {
  id: string;
  name: string;
  go_live_date: string | null;
  total_raised: number;
  open_count: number;
  open_high_count: number;
};

export type ReadinessColor = "red" | "amber" | "green" | "grey";

export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function readinessColor(w: WarehouseReadiness): ReadinessColor {
  if (!w.go_live_date) return "grey";

  const days = daysUntil(w.go_live_date)!;
  const openPct = w.total_raised > 0 ? w.open_count / w.total_raised : 0;

  if (w.open_high_count > 0 || (days < 0 && w.open_count > 0)) return "red";
  if (openPct > OPEN_PCT_THRESHOLD || (days < NEAR_LAUNCH_DAYS && w.open_count > 0)) return "amber";
  return "green";
}

// Dated warehouses first (soonest go-live first), then undated ones ordered
// by open-snag count descending — an undated site with heavy open work needs
// a date more urgently than a light one (PLAN.md §5.2.2).
export function sortByLaunchProximity(warehouses: WarehouseReadiness[]): WarehouseReadiness[] {
  const dated = warehouses
    .filter((w) => w.go_live_date)
    .sort((a, b) => a.go_live_date!.localeCompare(b.go_live_date!));
  const undated = warehouses
    .filter((w) => !w.go_live_date)
    .sort((a, b) => b.open_count - a.open_count);
  return [...dated, ...undated];
}

export function nextToLaunch(warehouses: WarehouseReadiness[]): WarehouseReadiness | null {
  const candidates = warehouses
    .filter((w) => w.go_live_date && w.open_count > 0)
    .sort((a, b) => a.go_live_date!.localeCompare(b.go_live_date!));
  return candidates[0] ?? null;
}
