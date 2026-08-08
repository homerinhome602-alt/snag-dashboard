// S.No, Date, and Description stay pinned to the left edge of the snag
// table while the rest of the columns scroll underneath them —
// snag-table.tsx (header) and snag-row.tsx (body cells) apply these so the
// columns line up. Widths are fixed so the left offsets stay in sync.
// table-layout:auto only treats `width` as a hint, so pin min-width and
// max-width too — otherwise short content (e.g. "006") renders narrower
// than the class implies and the hardcoded left-offsets below drift out
// of sync with the real column widths.
//
// Sticky cells paint their own opaque bg-card so scrolled-under columns
// don't show through, which also blocks the row's own hover tint from
// reaching them — group-hover here repaints the same tint so sticky and
// non-sticky columns highlight together (snag-row.tsx marks the <tr> as
// `group`).
const STICKY_HOVER = "bg-card group-hover:bg-muted/50"
export const STICKY_SNO_CLASS = `sticky left-0 z-10 w-14 min-w-14 max-w-14 ${STICKY_HOVER}`
export const STICKY_DATE_CLASS = `sticky left-14 z-10 w-16 min-w-16 max-w-16 ${STICKY_HOVER}`
export const STICKY_DESC_CLASS = `sticky left-[120px] z-10 ${STICKY_HOVER}`
