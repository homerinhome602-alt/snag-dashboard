export const CATEGORY_LABELS: Record<string, string> = {
  hvac: "HVAC",
  ops: "Ops",
};

export const SUB_CATEGORY_LABELS: Record<string, string> = {
  odu: "ODU",
  idu: "IDU",
  puff_panel: "Puff panel",
  plc: "PLC",
  door: "Door",
  floor: "Floor",
  piping: "Piping",
  racks: "Racks",
  electrical: "Electrical",
  iot_sensors: "IoT sensors",
  others: "Others",
};

export const LOCATION_LABELS: Record<string, string> = {
  frozen_chamber: "Frozen chamber",
  ante_room: "Ante room",
  odu_area: "ODU area",
  ambient_area: "Ambient area",
};

export const SCOPE_LABELS: Record<string, string> = {
  oem: "OEM",
  infra: "Infra",
  admin: "Admin",
};

export const SEVERITY_LABELS: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  wip: "WIP",
  ready_to_close: "Verify",
  closed: "Closed",
};

export const SEVERITY_CHIP: Record<string, string> = {
  high: "bg-blush text-red-deep",
  medium: "bg-amber text-amber-deep",
  low: "bg-frost text-teal-deep",
};

export const STATUS_CHIP: Record<string, string> = {
  open: "bg-blush text-red-deep",
  wip: "bg-sky text-teal-deep",
  ready_to_close: "bg-mint text-mint-deep",
  closed: "bg-line-soft text-muted-foreground",
};

// Matches the Phase 0 view's semantics exactly: coalesce(closed_at::date,
// current_date) - date_raised. A pure calendar-day difference, not
// real-time hours — a snag raised this morning reads 0d all day, not 1d.
export function ageingDays(dateRaised: string, closedAt: string | null): number {
  const start = new Date(dateRaised + "T00:00:00");
  const endDateStr = closedAt ? closedAt.slice(0, 10) : new Date().toLocaleDateString("en-CA");
  const end = new Date(endDateStr + "T00:00:00");
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

// No exact banding is specified in PLAN.md beyond "colour-banded" — using
// under a week / one-to-two weeks / beyond as a reasonable default scale.
export function ageingClass(days: number): string {
  if (days >= 14) return "text-red";
  if (days >= 7) return "text-amber-deep";
  return "text-muted-foreground";
}

export function isOverdue(etcDate: string | null, status: string): boolean {
  if (!etcDate || status === "closed") return false;
  return new Date(etcDate + "T00:00:00").getTime() < new Date().setHours(0, 0, 0, 0);
}
