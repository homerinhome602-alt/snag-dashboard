# Design system — Frozen Warehouse Launch Readiness

**Direction:** Thermal gradient (A), with the snag table adopting the denser mono treatment from Panel & seam (B).

**Status:** Built and verified against the running code on 9 Aug 2026, most recently re-checked 11 Aug 2026. The palette and all three typefaces shipped as specified — see §Implementation for how they are wired, and for the layout and motion behaviour added during live testing.

---

## Thesis

A frozen warehouse's failure mode is **heat**. Temperature excursions are warm events; frost heave is underfloor heating failing. So the palette is not decorative — **warm means wrong, cool means under control**. Every colour decision derives from this.

Consequence: saturated warm tones are reserved for attention states. A screen with nothing wrong should read cool and quiet. If the interface looks warm all over, something is broken.

---

## Colour

| Token | Hex | Use |
|---|---|---|
| `--ground` | `#FFF9F7` | Page background, table header fill |
| `--surface` | `#FFFFFF` | Cards, modals, rows |
| `--line` | `#F2DED8` | Card and container borders |
| `--line-soft` | `#F7EAE6` | Row dividers |
| `--blush` | `#FBE4DE` | Open status, chart gap fill, soft alert ground |
| `--coral` | `#E89484` | Thermometer warm end |
| `--red` | `#C75B4E` | High severity, overdue, raised line, primary alarm |
| `--red-deep` | `#8C3A31` | Text on blush |
| `--frost` | `#DCEAEE` | Thermometer cool end |
| `--teal` | `#6E9CA6` | Closed line, healthy marker |
| `--teal-deep` | `#28505E` | Text on sky |
| `--sky` | `#E2ECF2` | In progress status |
| `--mint` | `#E4EFE9` | Ready to close, ready state |
| `--mint-deep` | `#2C5142` | Text on mint |
| `--amber` | `#F7EAD8` | Medium severity |
| `--amber-deep` | `#7A4A12` | Text on amber |
| `--ink` | `#2E2422` | Primary text — warm near-black, never neutral grey |
| `--muted` | `#8A7A75` | Secondary text |
| `--faint` | `#A8938D` | Labels, placeholders, empty states |

Severity: high `--red` · medium `--amber` · low `--frost`
Status: open `--blush` · in progress `--sky` · ready to close `--mint` · closed neutral

---

## Type

| Role | Face | Notes |
|---|---|---|
| Display | Instrument Sans | **700 weight** (bumped from 500 — as built, 12 Aug 2026, after a legibility pass found the original weight read as too quiet against the palette's soft tones), `-0.015em` tracking. Screen and section titles only |
| Body | Inter | 400. All prose, form labels, descriptions |
| Data | IBM Plex Mono | Serial numbers, dates, counts, ageing, metrics. Never for prose |

Mono is functional, not stylistic: serials and ageing values must align vertically in a table scanned at speed.

**Scale** — screen title 17 · section 14 · body 12–13 · metric numeral 19–34 mono.

Uppercase labels split into two tiers by role, both `0.07em` tracking — **as built**, reconciled 12 Aug 2026 after a hygiene pass found drift (0.06–0.09em tracking, 9–11px sizes) across otherwise-identical labels:
- **Micro-labels** (10px→**9px**, `text-faint`) — table/column headers, sidebar section dividers, metric captions. The load-bearing majority pattern; every data table in the app uses this.
- **Field labels** (10.5px, `text-muted-foreground`) — sits directly above an input awaiting entry (form fields, the warehouse-code input). Slightly larger and a step darker than a micro-label, since it's addressing the user rather than labeling passive content.

Sentence case everywhere except mono table headers, which are uppercase to separate them from data.

---

## Form

- **Radii** — cards 14, controls 8, pills 20, table chips 4
- **Table rows** — 8px vertical padding (B's density), mono for serial and ageing, uppercase bold headers on `--line`. **As built**: enforced once in the shared `TableHeader`/`TableHead` (`components/ui/table.tsx`) — `bg-line` (#F2DED8) on the header row, `font-semibold` on the header cells, regardless of caller. First tried `--ground`, but that's only ~5 luminance points off pure white — too close to read as a deliberate band rather than noise, so a legibility pass (12 Aug 2026) moved it to `--line`, the app's border token, dual-purposed here as a fill since it's already the palette's next step down from `--ground`. The table's own card frame stays `--surface` (pure white) around it via each usage site's wrapping `bg-card`, so the header reads as a clearly darker band above a white body. Sticky header cells (`lib/table-sticky.ts`) paint their own opaque background to hide content scrolling underneath — that has to be overridden to `bg-line` too at each call site, or they show up as a lighter patch against the rest of the header.
- **Borders over shadows** — no drop shadows anywhere; elevation is communicated by border and fill
- **Spacing** — 26px between major sections, 12px between cards
- **Secondary controls read cool, primary actions read warm — as built (12 Aug 2026).** Table filters (`MultiSelectFilter`, `StatusFilter`) and outline-variant buttons (Deactivate/Activate, Export, Import, Close snag, Cancel) share one idle treatment — `border-teal bg-frost text-teal-deep` — instead of blending into the page. This extends the thermal thesis rather than introducing a new accent: cool tones are already "under control" in this palette, which is exactly what an organizational filter or a reversible secondary action is. A filter's *selected* state still switches to the warm `--accent`/`--primary` pairing, so picking a filter value reads as the same kind of state change as anything else warm on this screen. Primary (`default`-variant) buttons are unchanged — solid `--primary` red, reserved for the one committing action per screen.

---

## Signature: the readiness thermometer

Ten fixed bands running `--frost` → `--coral` → `--red`, with a triangular marker showing where a warehouse sits.

It is a **gauge, not a progress bar** — the scale is fixed and identical on every card, so warehouses can be compared against each other at a glance rather than each against itself. Marker position derives from the readiness formula in `PLAN.md` §5.2.1.

Reused at reduced scale as a top edge on the login card and on modal headers, so the motif ties screens together.

When a warehouse has no go-live date, the thermometer collapses to a single inert grey band — absence of a scale, not a zero reading.

---

## Quality floor

Not optional, and not to be announced in the UI:

- Responsive to 375px
- Visible keyboard focus on every interactive element
- `prefers-reduced-motion` respected
- Colour never the sole carrier of meaning — every status pill has a text label, every severity has a word
- Minimum 56px tap targets on the mobile raise flow (gloved hands)

---

## Motion

Restrained and purposeful, or absent. **As built**, this loosened slightly from the original "nothing else" rule after live feedback asked for more tactile feedback on interactive surfaces — still no page transitions, no staggered reveals:

- Thermometer marker eases into position on load — the one deliberate moment
- Row expansion for the update log and the team block
- **Hover-pop on cards** — dashboard summary cards, warehouse cards, and the warehouse-detail readiness tiles lift slightly and gain a shadow on hover (`CARD_HOVER` in `lib/utils.ts`, one shared treatment so it stays consistent rather than reimplemented per component)
- **Sidebar hover-expand** — the rail's width transitions smoothly on open/close, with content fading in on a slight delay after the width starts expanding, and fading out immediately on collapse
- **Snag-raised banner** — slides up, fades, and collapses its space over 300ms rather than disappearing instantly, after a 5-second display window

---

## Implementation

### Typography — as built

All three faces load via `next/font/google` in `src/app/layout.tsx`, exposed as CSS variables:

| Role | Face | Variable |
|---|---|---|
| Display | Instrument Sans | `--font-display` |
| Body | Inter | `--font-body` |
| Data | IBM Plex Mono | `--font-data` |

Self-hosted by `next/font`, so there is no external request and no flash of fallback text.

### Tokens — as built

`src/app/globals.css` defines the tokens above, then maps shadcn/ui's expected names onto them. Components therefore inherit the palette without knowing about it:

```
--background → --ground     --primary    → --red
--foreground → --ink        --accent     → --blush
--card       → --surface    --border     → --line
--muted      → --line-soft  --ring       → --red
--destructive → --red
```

Consequence: **change a token in one place and every shadcn component follows.** Never hardcode a hex in a component — the mapping is the whole point.

### Sticky columns

S.No, Date and Description pin to the left edge while the remaining columns scroll underneath. Classes live in `src/lib/table-sticky.ts` and are applied by both `snag-table.tsx` (header) and `snag-row.tsx` (body) so the offsets stay in sync.

| Column | Width | Left offset |
|---|---|---|
| S.No | 60px | 0 |
| Date | 70px | 60px |
| Description | 290px | 130px |

Total 420px pinned.

**Widths are fixed pixels, not percentages, and this is deliberate.** With `table-layout: auto`, percentage widths on cells are treated as loose hints — they compute correctly but the rendered box ignores them, which drifts the left offsets out of alignment with the actual columns. Pixels do not have that failure. If you are tempted to convert these to percentages to hit a proportional target, read the comment at the top of that file first; it was written after the bug.

### Sidebar

Collapses to an icon rail. Content is **fully hidden when collapsed**, not clipped or overflowing — a partially-visible label reads as a rendering fault. The Home link lives inside that same hidden content, so it only appears once the rail is open, with a divider separating it from the warehouse list. Sticky-positioned so it (and the top header) stay in place while the page scrolls. Reveals Warehouse management and User management only to Dashboard Admins, and the warehouse list itself only shows warehouses the current user can read (`PLAN.md` §2.3).

### Component map

Where each design element lives:

| Element | File |
|---|---|
| Readiness thermometer | `components/thermometer.tsx` |
| Landing card | `components/warehouse-card.tsx` |
| Team block (inline expand) | `components/team-block.tsx` |
| Burn-up chart | `components/burn-up-chart.tsx` |
| Snag table and rows | `components/snag-table.tsx`, `snag-row.tsx` |
| Sticky column classes | `lib/table-sticky.ts` |
| RAG colour and card sort | `lib/readiness.ts` |
| Photo capture and annotation | `components/photo-capture.tsx` |
| Video capture | `components/video-capture.tsx` |
| Duplicate warning modal | `components/duplicate-check-modal.tsx` |
| Offline queue and sync banner | `lib/offline-queue.ts`, `lib/sync-queue.ts`, `components/pending-sync-banner.tsx` |
| Excel import/export | `lib/excel.ts`, `components/export-button.tsx` |
| Searchable role/warehouse picker | `components/role-people-picker.tsx` |
| Multi-select table filter | `components/multi-select-filter.tsx` |
| Snag-raised banner | `app/(app)/warehouses/[id]/raised-banner.tsx` |
| Fixed role colours | `lib/roles.ts` |

### Readiness thresholds

The RAG formula in `lib/readiness.ts` uses named constants rather than inline numbers, so a future per-site settings screen can change them without touching the logic:

```
OPEN_PCT_THRESHOLD = 0.25
NEAR_LAUNCH_DAYS   = 14
```

Order of evaluation: no go-live date → grey. Any open high, or the date has passed with snags still open → red. Open percentage above threshold, or under 14 days with snags open → amber. Otherwise green.
