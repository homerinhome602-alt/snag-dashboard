# Design system — Frozen Warehouse Launch Readiness

**Direction:** Thermal gradient (A), with the snag table adopting the denser mono treatment from Panel & seam (B).

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
| Display | Instrument Sans | 500 weight, `-0.015em` tracking. Screen and section titles only |
| Body | Inter | 400. All prose, form labels, descriptions |
| Data | IBM Plex Mono | Serial numbers, dates, counts, ageing, metrics. Never for prose |

Mono is functional, not stylistic: serials and ageing values must align vertically in a table scanned at speed.

**Scale** — screen title 17 · section 14 · body 12–13 · label 10–11 uppercase with `0.07em` tracking · metric numeral 19–34 mono.

Sentence case everywhere except mono table headers, which are uppercase to separate them from data.

---

## Form

- **Radii** — cards 14, controls 8, pills 20, table chips 4
- **Table rows** — 8px vertical padding (B's density), mono for serial and ageing, uppercase mono headers on `--ground`
- **Borders over shadows** — no drop shadows anywhere; elevation is communicated by border and fill
- **Spacing** — 26px between major sections, 12px between cards

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

Restrained and purposeful, or absent:

- Thermometer marker eases into position on load — the one deliberate moment
- Row expansion for the update log
- Nothing else. No page transitions, no staggered card reveals, no hover lift
