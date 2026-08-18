// S.No, Date, and Description stay pinned to the left edge of the snag
// table while the rest of the columns scroll underneath them —
// snag-table.tsx (header) and snag-row.tsx (body cells) apply these so the
// columns line up. Widths are fixed pixels (60/70/290 = 420px), which
// lands around 35% of the table on typical viewport widths.
//
// Pinning is desktop-only, gated at 832px (sm's 640px + 30%, arbitrary
// min-[832px]: variant rather than the sm: token itself, so this doesn't
// shift every other sm: breakpoint in the app) — below that it's not worth
// the squeeze against the rest of the row, so the `sticky`/`left-*`/`z-10`
// classes are all min-[832px]:-prefixed; the columns simply scroll with
// everything else under that width.
//
// table-layout:auto only really enforces *pixel* width/min-width/max-width
// on a cell — percentage widths on cells get treated as loose hints and
// silently shrink to content size, which drifts the left-offsets below out
// of sync with actual rendered widths (confirmed by testing: %-based
// min/max-width computed correctly but the rendered box ignored them).
// Pixel values don't have that problem, so use those even though the
// "35%" ask is nominally a proportion.
// Sticky cells must stay fully opaque in every state, hover included —
// they sit visually on top of that same row's non-sticky cells once the
// table is scrolled right, and the row's own hover state is bg-muted/50
// (translucent). Matching that with an equally translucent hover here
// would let the scrolled-under content show through behind the frozen
// columns. color-mix computes the same visible tint as an *opaque* color
// instead, so nothing bleeds through no matter how far the row is scrolled.
const STICKY_HOVER =
  "bg-card group-hover:bg-[color-mix(in_oklch,var(--muted),var(--card)_50%)]"
export const STICKY_SNO_CLASS = `min-[832px]:sticky min-[832px]:left-0 min-[832px]:z-10 w-[60px] min-w-[60px] max-w-[60px] ${STICKY_HOVER}`
export const STICKY_DATE_CLASS = `min-[832px]:sticky min-[832px]:left-[60px] min-[832px]:z-10 w-[70px] min-w-[70px] max-w-[70px] ${STICKY_HOVER}`
export const STICKY_DESC_CLASS = `min-[832px]:sticky min-[832px]:left-[130px] min-[832px]:z-10 w-[290px] min-w-[290px] max-w-[290px] whitespace-normal break-words ${STICKY_HOVER}`
