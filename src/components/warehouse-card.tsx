import Link from "next/link";
import { Thermometer } from "@/components/thermometer";
import {
  daysUntil,
  readinessColor,
  type WarehouseReadiness,
} from "@/lib/readiness";
import { cn, CARD_HOVER } from "@/lib/utils";

const BADGE_CLASS: Record<string, string> = {
  red: "bg-blush text-red-deep border-blush",
  amber: "bg-amber text-amber-deep border-amber",
  green: "bg-mint text-mint-deep border-mint",
  grey: "bg-line-soft text-muted-foreground border-line-soft",
};

function badgeText(w: WarehouseReadiness, color: string, days: number | null) {
  if (color === "grey") return "No date";
  if (color === "red" && w.open_high_count > 0) return `${w.open_high_count} high`;
  if (color === "red") return "Overdue";
  if (color === "green") return "On track";
  return days !== null ? `${days} ${days === 1 ? "day" : "days"}` : "";
}

export function WarehouseCard({ w }: { w: WarehouseReadiness }) {
  const color = readinessColor(w);
  const days = daysUntil(w.go_live_date);
  const openPct = w.total_raised > 0 ? Math.round((w.open_count / w.total_raised) * 100) : 0;
  const position = w.total_raised > 0 ? Math.min(98, Math.max(2, openPct)) : null;

  return (
    <Link
      href={`/warehouses/${w.id}`}
      className={cn(CARD_HOVER, "block rounded-card border border-border bg-card p-3.5")}
      style={color === "red" ? { borderColor: "#EFC6BC" } : undefined}
    >
      <div className="flex items-center justify-between">
        <span className="text-[13.5px] font-medium text-foreground">{w.name}</span>
        <span className={`rounded-pill border px-2.5 py-0.5 text-[10.5px] ${BADGE_CLASS[color]}`}>
          {badgeText(w, color, days)}
        </span>
      </div>
      <div className="font-mono mb-2.5 mt-0.5 text-[10px] text-faint">
        {w.go_live_date
          ? `GO-LIVE ${new Date(w.go_live_date + "T00:00:00").toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            }).toUpperCase()}${days !== null ? ` · ${days} DAYS` : ""}`
          : "GO-LIVE NOT SET"}
      </div>
      <Thermometer color={color} position={position} />
      <div className="flex gap-4.5">
        <div>
          <div className={cn("font-mono text-[20px] leading-none", color === "red" && "text-red")}>
            {w.open_count}
          </div>
          <div className="text-[9px] text-faint">open</div>
        </div>
        <div>
          <div className="font-mono text-[20px] leading-none">{w.total_raised}</div>
          <div className="text-[9px] text-faint">raised</div>
        </div>
        <div>
          <div className="font-mono text-[20px] leading-none">{openPct}%</div>
          <div className="text-[9px] text-faint">open</div>
        </div>
      </div>
    </Link>
  );
}
