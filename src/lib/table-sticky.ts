// S.No, Date, and Description stay pinned to the left edge of the snag
// table while the rest of the columns scroll underneath them —
// snag-table.tsx (header) and snag-row.tsx (body cells) apply these so the
// columns line up. Widths are fixed pixels (60/70/290 = 420px), which
// lands around 35% of the table on typical viewport widths.
//
// table-layout:auto only really enforces *pixel* width/min-width/max-width
// on a cell — percentage widths on cells get treated as loose hints and
// silently shrink to content size, which drifts the left-offsets below out
// of sync with actual rendered widths (confirmed by testing: %-based
// min/max-width computed correctly but the rendered box ignored them).
// Pixel values don't have that problem, so use those even though the
// "35%" ask is nominally a proportion.
const STICKY_HOVER = "bg-card group-hover:bg-muted/50"
export const STICKY_SNO_CLASS = `sticky left-0 z-10 w-[60px] min-w-[60px] max-w-[60px] ${STICKY_HOVER}`
export const STICKY_DATE_CLASS = `sticky left-[60px] z-10 w-[70px] min-w-[70px] max-w-[70px] ${STICKY_HOVER}`
export const STICKY_DESC_CLASS = `sticky left-[130px] z-10 w-[290px] min-w-[290px] max-w-[290px] whitespace-normal break-words ${STICKY_HOVER}`
