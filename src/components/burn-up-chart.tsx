"use client";

// PLAN.md §12: the only chart in the product. Two cumulative lines (raised,
// closed) with the shaded gap between them as the open count, projected
// forward to the go-live date. Shows real data from the first snag raised
// (not gated behind a week of history) — today's point always reflects
// live totals even if the daily snapshot job hasn't run yet today.

import { useMemo, useState } from "react";

export type Snapshot = {
  snapshot_date: string;
  total_raised: number;
  total_closed: number;
};

const WIDTH = 620;
const HEIGHT = 150;
const PAD_LEFT = 30;
const PAD_RIGHT = 10;
const PAD_TOP = 14;
const PAD_BOTTOM = 20;

function toTime(dateStr: string) {
  return new Date(dateStr + "T00:00:00").getTime();
}

function todayStr() {
  return new Date().toLocaleDateString("en-CA");
}

function fmtShort(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function buildPath(points: { x: number; y: number }[]) {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

export function BurnUpChart({
  snapshots,
  goLiveDate,
  liveTotalRaised,
  liveTotalClosed,
}: {
  snapshots: Snapshot[];
  goLiveDate: string | null;
  liveTotalRaised: number;
  liveTotalClosed: number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const today = todayStr();
  const byDate = new Map(snapshots.map((s) => [s.snapshot_date, s]));
  // Live totals always win for today's point, even if the cron job hasn't
  // written today's snapshot row yet.
  byDate.set(today, { snapshot_date: today, total_raised: liveTotalRaised, total_closed: liveTotalClosed });
  const sorted = [...byDate.values()].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));

  if (sorted.length === 0 || sorted[sorted.length - 1].total_raised === 0) {
    return (
      <div className="flex h-[150px] items-center justify-center rounded-card border border-border bg-card text-[12px] text-muted-foreground">
        No snags raised yet — the burn-up appears once the first one is.
      </div>
    );
  }

  const firstDate = sorted[0].snapshot_date;
  const lastDate = sorted[sorted.length - 1].snapshot_date;

  const hasTarget = !!goLiveDate && toTime(goLiveDate) > toTime(lastDate);
  const xEndDate = hasTarget ? goLiveDate! : lastDate;

  const xStart = toTime(firstDate);
  const xEnd = toTime(xEndDate);
  const xSpan = Math.max(1, xEnd - xStart);

  const maxRaised = Math.max(...sorted.map((s) => s.total_raised), 1);
  const yMax = Math.ceil(maxRaised * 1.15) || 1;

  const x = (dateStr: string) => PAD_LEFT + ((toTime(dateStr) - xStart) / xSpan) * (WIDTH - PAD_LEFT - PAD_RIGHT);
  const y = (v: number) => HEIGHT - PAD_BOTTOM - (v / yMax) * (HEIGHT - PAD_TOP - PAD_BOTTOM);

  const raisedPoints = sorted.map((s) => ({ x: x(s.snapshot_date), y: y(s.total_raised) }));
  const closedPoints = sorted.map((s) => ({ x: x(s.snapshot_date), y: y(s.total_closed) }));

  // Weekly tick marks from the first date through today, plus today itself.
  const weekTicks: string[] = [];
  for (let t = xStart; t <= toTime(today); t += 7 * 86_400_000) {
    weekTicks.push(new Date(t).toLocaleDateString("en-CA"));
  }
  if (weekTicks[weekTicks.length - 1] !== today) weekTicks.push(today);

  // Simple linear projection: slope from the trailing window of history,
  // extended to the go-live date.
  const windowSize = Math.min(7, sorted.length - 1);
  const trailStart = sorted[sorted.length - 1 - windowSize];
  const trailEnd = sorted[sorted.length - 1];
  const daySpan = Math.max(1, (toTime(trailEnd.snapshot_date) - toTime(trailStart.snapshot_date)) / 86_400_000);

  let raisedProjected: { x: number; y: number } | null = null;
  let closedProjected: { x: number; y: number } | null = null;
  if (hasTarget && sorted.length > 1) {
    const targetDays = (toTime(xEndDate) - toTime(trailEnd.snapshot_date)) / 86_400_000;
    const raisedSlope = (trailEnd.total_raised - trailStart.total_raised) / daySpan;
    const closedSlope = (trailEnd.total_closed - trailStart.total_closed) / daySpan;
    raisedProjected = {
      x: x(xEndDate),
      y: y(Math.max(trailEnd.total_raised, trailEnd.total_raised + raisedSlope * targetDays)),
    };
    closedProjected = {
      x: x(xEndDate),
      y: y(Math.max(trailEnd.total_closed, trailEnd.total_closed + closedSlope * targetDays)),
    };
  }

  const gapPath =
    raisedPoints.length > 1
      ? `${buildPath(raisedPoints)} L${raisedPoints[raisedPoints.length - 1].x.toFixed(1)},${(
          HEIGHT - PAD_BOTTOM
        ).toFixed(1)} ${buildPath([...closedPoints].reverse()).replace("M", "L")} Z`
      : "";

  const todayX = x(today);
  const hovered = hoverIdx !== null ? sorted[hoverIdx] : null;

  function onMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let closest = 0;
    let closestDist = Infinity;
    sorted.forEach((s, i) => {
      const d = Math.abs(x(s.snapshot_date) - svgX);
      if (d < closestDist) {
        closestDist = d;
        closest = i;
      }
    });
    setHoverIdx(closest);
  }

  return (
    <div className="relative rounded-card border border-border bg-card p-3">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[9px] uppercase tracking-[0.07em] text-faint">Burn-up</span>
        <span className="text-[10px] text-muted-foreground">Hover for weekly figures</span>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="block w-full"
        role="img"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <title>Burn-up chart</title>
        <desc>Cumulative raised and closed lines; the shaded gap is the open count.</desc>
        <g stroke="#F7EAE6">
          <line x1={PAD_LEFT} y1={y(yMax * 0.33)} x2={WIDTH - PAD_RIGHT} y2={y(yMax * 0.33)} />
          <line x1={PAD_LEFT} y1={y(yMax * 0.66)} x2={WIDTH - PAD_RIGHT} y2={y(yMax * 0.66)} />
        </g>
        {gapPath && <path d={gapPath} fill="#FBE4DE" opacity={0.6} />}
        <path d={buildPath(raisedPoints)} fill="none" stroke="#C75B4E" strokeWidth={2.5} />
        <path d={buildPath(closedPoints)} fill="none" stroke="#6E9CA6" strokeWidth={2.5} />
        {raisedProjected && (
          <path
            d={`M${raisedPoints[raisedPoints.length - 1].x},${raisedPoints[raisedPoints.length - 1].y} L${raisedProjected.x},${raisedProjected.y}`}
            fill="none"
            stroke="#C75B4E"
            strokeWidth={2}
            strokeDasharray="5 4"
            opacity={0.55}
          />
        )}
        {closedProjected && (
          <path
            d={`M${closedPoints[closedPoints.length - 1].x},${closedPoints[closedPoints.length - 1].y} L${closedProjected.x},${closedProjected.y}`}
            fill="none"
            stroke="#6E9CA6"
            strokeWidth={2}
            strokeDasharray="5 4"
            opacity={0.55}
          />
        )}
        <line x1={todayX} y1={PAD_TOP} x2={todayX} y2={HEIGHT - PAD_BOTTOM} stroke="#D3C4BE" strokeDasharray="3 4" />
        <text x={todayX + 4} y={PAD_TOP + 8} fontSize={9} fill="var(--faint)">
          today
        </text>
        <text x={PAD_LEFT + 4} y={raisedPoints[0].y - 4} fontSize={9} fill="#C75B4E">
          raised
        </text>
        <text x={PAD_LEFT + 4} y={closedPoints[0].y + 12} fontSize={9} fill="#6E9CA6">
          closed
        </text>

        {hovered && (
          <g pointerEvents="none">
            <line
              x1={x(hovered.snapshot_date)}
              y1={PAD_TOP}
              x2={x(hovered.snapshot_date)}
              y2={HEIGHT - PAD_BOTTOM}
              stroke="#2E2422"
              strokeWidth={1}
              opacity={0.3}
            />
            <circle cx={x(hovered.snapshot_date)} cy={y(hovered.total_raised)} r={4} fill="#C75B4E" stroke="#fff" strokeWidth={1.5} />
            <circle cx={x(hovered.snapshot_date)} cy={y(hovered.total_closed)} r={4} fill="#6E9CA6" stroke="#fff" strokeWidth={1.5} />
          </g>
        )}

        <rect
          x={PAD_LEFT}
          y={PAD_TOP - 4}
          width={WIDTH - PAD_LEFT - PAD_RIGHT}
          height={HEIGHT - PAD_TOP - PAD_BOTTOM + 4}
          fill="transparent"
          onMouseMove={onMove}
          style={{ cursor: "crosshair" }}
        />
      </svg>

      {hovered && (
        <div className="pointer-events-none absolute rounded-md bg-foreground px-2 py-1 text-[10px] leading-relaxed text-background shadow-md"
          style={{ left: `${(x(hovered.snapshot_date) / WIDTH) * 100}%`, top: 28, transform: "translateX(-50%)" }}
        >
          <div className="font-mono">{fmtShort(hovered.snapshot_date)}{hovered.snapshot_date === today ? " (today)" : ""}</div>
          <div>Raised: {hovered.total_raised} · Closed: {hovered.total_closed}</div>
        </div>
      )}

      <div className="mt-1 flex justify-between text-[9px] text-faint">
        {weekTicks.map((d) => (
          <span key={d} className={d === today ? "font-medium text-muted-foreground" : undefined}>
            {fmtShort(d)}
          </span>
        ))}
        {hasTarget && <span>go-live {fmtShort(xEndDate)}</span>}
      </div>
    </div>
  );
}
