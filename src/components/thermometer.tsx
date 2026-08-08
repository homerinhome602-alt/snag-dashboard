import type { ReadinessColor } from "@/lib/readiness";

// Ten fixed bands, frost -> coral -> red (DESIGN.md "signature: the
// readiness thermometer"). Fixed scale so warehouses compare against each
// other, not against themselves.
const BANDS = [
  "#DCEAEE", "#E1EBEC", "#E8ECEA", "#EFEBE6", "#F5E9E2",
  "#FBE4DE", "#F6D4CB", "#F0BFB2", "#E89484", "#D9756A",
];

const MARKER_COLOR: Record<ReadinessColor, string> = {
  red: "#C75B4E",
  amber: "#B98A5E",
  green: "#6E9CA6",
  grey: "#A8938D",
};

export function Thermometer({
  color,
  position,
}: {
  color: ReadinessColor;
  position: number | null;
}) {
  if (color === "grey" || position === null) {
    return (
      <div>
        <div className="mb-[3px] flex gap-[2px]">
          <span className="h-[7px] flex-1 rounded-[2px] bg-line-soft" />
        </div>
        <div className="mb-2.5 h-[10px] text-[10px] text-faint">
          Set a go-live date to track readiness
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-[3px] flex gap-[2px]">
        {BANDS.map((c, i) => (
          <span
            key={i}
            className="h-[7px] flex-1"
            style={{
              background: c,
              borderRadius: i === 0 ? "2px 0 0 2px" : i === BANDS.length - 1 ? "0 2px 2px 0" : undefined,
            }}
          />
        ))}
      </div>
      <div className="relative mb-2.5 h-[10px]">
        <span
          className="absolute -translate-x-1/2 text-[9px] leading-none"
          style={{ left: `${position}%`, color: MARKER_COLOR[color] }}
        >
          ▲
        </span>
      </div>
    </div>
  );
}
