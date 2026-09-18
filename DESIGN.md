# Design system — Frozen Warehouse Launch Readiness

**Direction:** Thermal gradient (A), with the snag table adopting the denser mono treatment from Panel & seam (B).

**Status:** Built and verified against the running code on 9 Aug 2026, most recently re-checked 18 Sep 2026 (two corrections made — the auth-card gradient strip and the People-screen status count, both stale after the 18 Sep 2026 auth rewrite; see PLAN.md §5.1/§5.6) as part of a full plan/design/CLAUDE.md consistency pass. The palette and all three typefaces shipped as specified — see §Implementation for how they are wired, and for the layout and motion behaviour added during live testing.

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
| `--line` | `#E0C0B0` | Card and container borders. **As built**, darkened from the original `#F2DED8` (12 Aug 2026) — the original was only ~24 luminance points off `--ground`, read as barely-there in practice. Also backs `--input` and `--sidebar-border`, so this one change cascades to every input field and the sidebar too, not just cards. |
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
| `--muted` | `#5C4F4B` | Secondary text — table cell values (dates, category, sub-category, location, scope), metric captions. **As built**, darkened twice: `#8A7A75` → `#736662` (12 Aug 2026, fixing a 3.9-4.1:1 ratio below WCAG AA) → `#5C4F4B` (18 Aug 2026, after live feedback that even the AA-passing `#736662` still read as too light against the rest of the palette). Now ~7.8:1 against white/ground. |
| `--faint` | `#6B5A54` | Labels, placeholders, empty states. **As built**, darkened twice: `#A8938D` → `#876E67` (12 Aug 2026, fixing a 2.8-2.9:1 ratio) → `#6B5A54` (18 Aug 2026, same pass as `--muted-foreground` above). Now ~6.5:1. |

Severity: high `--red` · medium `--amber` · low `--frost`
Status: open `--blush` · in progress `--sky` · ready to close `--mint` · closed neutral

**Known exception to "never hardcode a hex" — `#EFC6BC`.** `warehouse-card.tsx`'s red-state card border (`style={color === "red" ? { borderColor: "#EFC6BC" } : undefined}`) doesn't match any token above — closest is `--blush` (`#FBE4DE`) but it's visibly not the same value. Found during the 18 Aug 2026 audit; left as an inline style rather than silently swapped to the nearest token, since that would be an unreviewed visual change. Two other inline-hex instances in the same audit (`page.tsx`'s and this file's `#C75B4E` numerals) were fixed to `text-red`, since that token already resolves to the identical hex — this one wasn't, because no token matches it.

---

## Type

| Role | Face | Notes |
|---|---|---|
| Display | Instrument Sans | **700 weight** (bumped from 500 — as built, 12 Aug 2026, after a legibility pass found the original weight read as too quiet against the palette's soft tones), `-0.015em` tracking. Screen and section titles only |
| Display, discrepancy found 19 Aug 2026 | — | The 700-weight bump above only ever landed in `globals.css` (`h1,h2,h3 { font-weight: 700 }`) — `app/layout.tsx`'s `next/font/google` call still loads `Instrument_Sans` with `weight: ["500"]` only, never updated to include `"700"`. A static (non-`"variable"`) Google Font in `next/font` only serves the weights actually requested, so the browser is rendering headings as **synthetic/faux bold** applied to the 500-weight glyphs, not a genuine 700-weight font file — not what the 12 Aug change intended, and visually different (crisper true-bold vs. browser-faked bold) from what loading `weight: ["500", "700"]` would produce. Left as-is here since fixing it is a product decision outside a documentation pass — but an exact rebuild should replicate the *current* synthetic-bold behavior (i.e. keep `weight: ["500"]`), not silently "correct" it to load real 700, or headings will render subtly differently from the live app. |
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
- **Table rows** — 8px vertical padding (B's density), mono for serial and ageing, uppercase bold headers on `--line`. **As built**: enforced once in the shared `TableHeader`/`TableHead` (`components/ui/table.tsx`) — `bg-line` on the header row, `font-semibold` on the header cells, regardless of caller. First tried `--ground`, but that's only ~5 luminance points off pure white — too close to read as a deliberate band rather than noise, so a legibility pass (12 Aug 2026) moved it to `--line`, the app's border token, dual-purposed here as a fill since it's already the palette's next step down from `--ground`. The table's own card frame stays `--surface` (pure white) around it via each usage site's wrapping `bg-card`, so the header reads as a clearly darker band above a white body. Sticky header cells (`lib/table-sticky.ts`) paint their own opaque background to hide content scrolling underneath — that has to be overridden to `bg-line` too at each call site, or they show up as a lighter patch against the rest of the header.
- **Borders over shadows** — no drop shadows anywhere; elevation is communicated by border and fill
- **Spacing** — 26px between major sections, 12px between cards
- **Secondary controls read cool, primary actions read warm — as built (12 Aug 2026).** Table filters (`MultiSelectFilter`, `StatusFilter`) and outline-variant buttons (Deactivate/Activate, Export, Import, Close snag, Cancel) share one idle treatment — `border-teal bg-frost text-teal-deep` — instead of blending into the page. This extends the thermal thesis rather than introducing a new accent: cool tones are already "under control" in this palette, which is exactly what an organizational filter or a reversible secondary action is. A filter's *selected* state still switches to the warm `--accent`/`--primary` pairing, so picking a filter value reads as the same kind of state change as anything else warm on this screen. Primary (`default`-variant) buttons are unchanged — solid `--primary` red, reserved for the one committing action per screen.
- **Chat bubble sides carry the same thesis one step further — as built (14 Aug 2026), extended to the message box itself (17 Aug 2026).** The update thread's role badges use `bg-blush text-red-deep` for the reporter (left) and `bg-frost text-teal-deep` for the resolver (right) — reporters raise the problem, resolvers drive it to the fix, so warm-left/cool-right mirrors "warm means wrong, cool means under control" applied to *who's speaking* rather than *what severity something is*. A Dashboard Admin's message (centered, neither side) gets a third, deliberately neutral `bg-line-soft text-foreground` badge instead of stretching the warm/cool pairing to cover a case it doesn't describe. The message box itself now carries the same tint as its badge (`border-blush bg-blush` / `border-frost bg-frost` / `border-line-soft bg-line-soft`) rather than a plain white box with only the badge colored — feedback after the first version found a same-colored badge on an otherwise neutral bubble too subtle to read as "which side" at a glance.

---

## Signature: the readiness thermometer

Ten fixed bands running `--frost` → `--coral` → `--red`, with a triangular marker showing where a warehouse sits.

**As built**, `components/thermometer.tsx` hardcodes the ten band hexes as a literal array rather than deriving them from the token table above — a deliberate exception, since a smooth 10-step gradient interpolated between just `--frost`/`--coral`/`--red` needs intermediate stops no single named token provides:

```
["#DCEAEE", "#E1EBEC", "#E8ECEA", "#EFEBE6", "#F5E9E2",
 "#FBE4DE", "#F6D4CB", "#F0BFB2", "#E89484", "#D9756A"]
```

The triangular marker's fill is a separate small map, keyed by the same RAG colour name used everywhere else (`lib/readiness.ts`):

```
{ red: "#C75B4E", amber: "#B98A5E", green: "#6E9CA6", grey: "#A8938D" }
```

`grey`'s hex here is stale relative to the current `--faint` (`#6B5A54`, darkened twice — 12 Aug and 18 Aug 2026) — but it's unreachable in practice, since the grey/no-go-live-date case returns before a marker ever renders, so it's noted here rather than fixed.

It is a **gauge, not a progress bar** — the scale is fixed and identical on every card, so warehouses can be compared against each other at a glance rather than each against itself. Marker position derives from the readiness formula in `PLAN.md` §5.2.1.

**Reused at reduced scale as a top edge on the auth card — corrected 19 Aug 2026, was previously mis-stated as "and on modal headers"; corrected again 18 Sep 2026 for the same reason it needed correcting the first time (verify, don't infer from a prior description).** `/set-password`, `/forgot-password`, and `/auth/update-password` are gone entirely (PLAN.md §5.1, 18 Sep 2026 auth rewrite) — `/login` is the only page left in the app, auth or otherwise, and it still carries this strip. Not literally the same array as the main thermometer's 10 stops, scaled down — it's a separately hardcoded 8-stop gradient, a local `THERMOMETER` constant in `src/app/login/page.tsx`:

```
["#DCEAEE", "#E4EBEA", "#EDEAE5", "#F5E7E0", "#FBE4DE", "#F2C7BB", "#E89484", "#C75B4E"]
```

Rendered as 8 equal-width `h-1.5` flex segments across the top of the login card.

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
--destructive → --red       --input      → --line
```

Consequence: **change a token in one place and every shadcn component follows.** Never hardcode a hex in a component — the mapping is the whole point.

**As built**, the same `@theme inline` block in `globals.css` also carries shadcn's full expected token set beyond the core mapping above — `--chart-1` through `--chart-5` (unused: the burn-up chart draws its two lines directly from `--red`/`--teal`, not the chart tokens) and the `--sidebar-*` family (`--sidebar`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-accent`, `--sidebar-border`, `--sidebar-ring`), plus the radius scale: `--radius-card: 0.875rem` (14px, matching "Radii — cards 14" above), `--radius-pill: 1.25rem` (20px), `--radius-chip: 0.25rem` (4px, matching "table chips 4"). These exist so shadcn primitives (`Sidebar`, chart components) resolve to the palette automatically if ever used, even though the app's own components mostly reach for the token classes directly rather than the shadcn primitives.

### Sticky columns

S.No, Date and Description pin to the left edge while the remaining columns scroll underneath — **desktop only**, per below. Classes live in `src/lib/table-sticky.ts` and are applied by both `snag-table.tsx` (header) and `snag-row.tsx` (body) so the offsets stay in sync.

| Column | Width | Left offset |
|---|---|---|
| S.No | 60px | 0 |
| Date | 70px | 60px |
| Description | 290px | 130px |

Total 420px pinned.

**Widths are fixed pixels, not percentages, and this is deliberate.** With `table-layout: auto`, percentage widths on cells are treated as loose hints — they compute correctly but the rendered box ignores them, which drifts the left offsets out of alignment with the actual columns. Pixels do not have that failure. If you are tempted to convert these to percentages to hit a proportional target, read the comment at the top of that file first; it was written after the bug.

**Freeze only applies at 832px and up — as built (18 Aug 2026).** Below that, the three columns scroll with the rest of the row instead of pinning; pinning 420px against a narrow screen left too little room for everything else. The `sticky`/`left-*`/`z-10` classes carry an arbitrary `min-[832px]:` variant rather than Tailwind's `sm:` token directly — 832 is `sm`'s 640px stretched 30% on request, applied only to this table so no other `sm:` breakpoint elsewhere in the app shifts with it.

**The table's own horizontal scrollbar gets a little breathing room below the last row (18 Aug 2026).** The scroll container carries `pb-2` — on macOS's overlay-scrollbar style, the bar was rendering flush against the last row's bottom edge, covering part of it while actively scrolling.

**The expanded row's chat panel uses the same trick one level down — as built (17 Aug 2026), width fix and visual treatment revised the same day.** The `<td colSpan={13}>` it lives in can't itself be sticky (position:sticky doesn't work on a cell spanning the full row width), but a plain `<div>` nested inside that wide cell can be — it sticks to the left edge of the table's own scroll container regardless of how far the table is scrolled. Width was originally a guessed `w-[min(1000px,90vw)]` cap; that's gone, replaced by a `ResizeObserver` reading the scroll container's own `clientWidth` so the panel always matches the true visible screen area (accounts for sidebar state and viewport size without hardcoding either). The panel also sits on `bg-background` with a border, padding, and a small uppercase "SNAG #N — UPDATES" label — the earlier version shared the table body's plain `bg-card` and read as more table rather than a distinct panel.

### Hover tooltips (CSS-only, no JS state)

`GoLiveHistoryInfo` (go-live date's history icon, §Component map) is the first CSS-only `group`/`group-hover` tooltip in the app, built after a real bug: `pointer-events-none` on the tooltip box, combined with a `margin-top` gap between the trigger icon and the box, meant moving the mouse from the icon down into the tooltip crossed a stretch of nothing that isn't part of the `group`'s hoverable area — the browser hit-tests whatever's *behind* a `pointer-events-none` element, not the element itself, so hover dropped and the tooltip closed before you could read a long list or scroll it.

**Fixed pattern for any future hover tooltip**: two nested boxes, not one. The outer box is invisible, positioned, and carries the gap as `padding-top` (not `margin-top`) — padding is still inside the element's own hoverable box, margin isn't. The inner box carries the visible background/border/shadow. Neither box sets `pointer-events-none`. This keeps the hover chain unbroken all the way from the trigger through the gap into the tooltip content itself.

### Interaction patterns — hover vs click, every dropdown and expandable element classified

Added 24 Aug 2026 after a direct question about dropdown hover behavior — the honest answer turned out to be **almost nothing in this app opens or closes on hover**. Verified by reading every interactive open/close component in the codebase; this is the complete list, not a sample.

**Hover-driven** (exactly two things in the whole app):
- **Sidebar rail** (`app-shell.tsx`) — opens on `onMouseEnter` of the whole `<nav>`, closes on `onMouseLeave`. **`md` and up only** — below `md` the sidebar is a click-driven off-canvas drawer (hamburger / backdrop / `×` / `Esc` / link), no hover anywhere in it. See "Sidebar" below.
- **Go-live date history icon** (`go-live-history-info.tsx`) — pure CSS `group`/`group-hover`, no JS state at all. See "Hover tooltips" above. Opens when the cursor enters the icon *or* the tooltip panel itself (the padding-bridge fix above exists specifically so moving from one to the other doesn't drop it); closes the instant the cursor leaves both.

**Click-driven — everything that looks like a "dropdown" is actually this**, not hover:
- **`MultiSelectFilter`** (`components/multi-select-filter.tsx`) — every snag-table filter (Status/Category/Sub-category/Location/Scope/Severity), the invite form's warehouse picker, and "+ Add warehouse"'s picker all reuse this one component. Trigger button toggles `open` on **click** (`onClick={() => setOpen(v => !v)}`), not hover. Closes on a document-level `mousedown` listener that checks whether the click landed outside both the trigger and the panel — so clicking *inside* the panel (including the panel's own "All"/"Clear" buttons) never closes it. **Checking or unchecking an option does not close the dropdown either** — `toggle()` only calls `onChange`, never touches `open` — by design, so picking several values in a row doesn't require reopening it each time. Hovering the trigger or the panel does nothing at all; there's no `:hover`/`onMouseEnter` handler anywhere in this component.
- **`Select`** (`components/ui/select.tsx`, the Role picker on the invite form) — a thin wrapper over `@base-ui/react`'s `Select` primitive. Standard combobox behavior: click the trigger to open, click an item (or Escape, or click outside) to close. No custom hover logic layered on top of the primitive.
- **Native `<select>`** (the status dropdown in `snag-compose.tsx`'s `StatusControls`) — plain HTML, fully OS-native. Click to open, click an option to select and close; whatever hover-highlight-under-cursor behavior the OS provides is not something this app controls or customizes.
- **Expandable rows** — the snag table's chat-thread expand (`snag-row.tsx`), Warehouse Management's status-history expand (`warehouse-row.tsx`), and People Management's change-history expand (`person-row.tsx`) all toggle on a **click** of the row (`onClick` on the `TableRow`), not hover. All three use local `useState`, not a shared component.
- **Team block** (`team-block.tsx`) — "Show all N" is a click-toggled button, not hover.

### Sidebar

Collapses to an icon rail. Content is **fully hidden when collapsed**, not clipped or overflowing — a partially-visible label reads as a rendering fault. The Home link lives inside that same hidden content, so it only appears once the rail is open, with a divider separating it from the warehouse list. Sticky-positioned so it (and the top header) stay in place while the page scrolls. Reveals Warehouse management and User management only to Dashboard Admins, and the warehouse list itself only shows warehouses the current user can read (`PLAN.md` §2.3).

**As built, the open/collapse trigger is hover, not click.** `app-shell.tsx`'s outer `<nav>` sets `open` state directly from `onMouseEnter`/`onMouseLeave` — entering the rail always forces it open, leaving always forces it closed. A hamburger button nested inside also carries its own `onClick` toggle, but since the hover handlers re-decide `open` on every enter/leave regardless of the button's own state, the click toggle is functionally superseded rather than an equal second way to operate it. `SIDEBAR_WIDTH = "11.5rem"`, `SIDEBAR_COLLAPSED = "3rem"`.

**As built (Sep 2026) — the hover rail is `md`-and-up only; below `md` the sidebar is an off-canvas drawer.** `app-shell.tsx` was rewritten into two navs sharing a `NavLinks` sub-component. The desktop rail (`sticky top-0 hidden h-screen … md:flex`) keeps the hover behaviour above. Below `md`, a hamburger button in the top bar (`aria-label="Open menu"`, `md:hidden`) toggles `mobileOpen`; the drawer is `fixed inset-y-0 left-0 z-40 w-60 … md:hidden` translated in/out with `translate-x-0` / `-translate-x-full`, over a `bg-black/40` backdrop (`z-30`). It closes on the backdrop, an `×` button, `Esc` (a `useEffect` keydown listener), or any nav link (`onNavigate` passed into `NavLinks`). There is no pathname-effect close — that tripped `react-hooks/set-state-in-effect`, and the four close paths already cover it. Top bar also: the page title is `truncate` and steps up to `sm:text-[14px]`; the user's name is `hidden … sm:inline`.

### Shared primitives — as built

`components/ui/*.tsx` are shadcn-generated; most are unmodified from the generator (`Input`, `Label`, `Alert`) and carry no app-specific customization worth documenting beyond what the token mapping already covers. Two are customized in ways that matter:

**`Button`** (`ui/button.tsx`) — `variant="outline"` is the one hand-edited variant, changed from shadcn's neutral default to `border-teal bg-frost text-teal-deep` — this is the concrete implementation of "secondary controls read cool" (Form section above). Every other variant (`default`, `secondary`, `ghost`, `destructive`, `link`) is stock. Sizes: `default` (h-8), `sm`, `xs` (h-6), `lg` (h-9), plus icon-only squares at each height (`icon`/`icon-sm`/`icon-xs`/`icon-lg`). **`sm` is responsive as of Sep 2026** — `h-9 … px-3` below `sm` (a real 36px touch target), collapsing to `sm:h-7 sm:px-2.5` (the old fixed value) at `sm` and up. This is the one size that differs by breakpoint; it's used for most of the small in-card action buttons (handover Upload/Replace, "+ Add Chamber", Expand/Collapse, row Edit) which are otherwise too short to tap reliably on a phone. Active-state press feedback is a 1px downward translate (`active:translate-y-px`), app-wide, not per-component.

**`Badge`** (`ui/badge.tsx`) — the component itself is stock shadcn; every visual variant seen in the app (status pills, role chips, severity chips) is a `className` override supplied at the call site, not a `badgeVariants` entry. Base shape is fixed regardless of caller: `h-5`, `rounded-4xl` (pill), `text-xs`, `px-2 py-0.5`.

### Icons — as built

Two sources, both small and enumerable — this app does not use a general-purpose icon set:

**Custom inline SVG** (hand-drawn `<svg>` markup, no icon library), 3 distinct glyphs across 4 call sites:
| Icon | Used in | Size | Definition |
|---|---|---|---|
| Hamburger | Sidebar toggle button (`app-shell.tsx`) | 18×14 viewBox | Three horizontal `<line>`s, `strokeWidth 1.5`, at y=1/7/13 |
| Home | Sidebar Home link (`app-shell.tsx`) | 16×16 viewBox | One `<path>`, roof + door outline, `strokeWidth 1.4`, rounded caps/joins |
| Info (circle-i) | Sidebar "About the page" link (`app-shell.tsx`), **and separately** the go-live date history icon (`go-live-history-info.tsx`) | 16×16 in the sidebar, **13×13** at the go-live icon | Circle `r=6` + a vertical stem + a dot, `strokeWidth 1.4`. **Duplicated, not shared** — the go-live icon's `<svg>` is a second, independent copy of the same path data at a different size, not an import of the sidebar's `InfoIcon` function. Editing one does not affect the other. |

**`lucide-react`** (the only external icon library imported anywhere): `ArrowUp`/`ArrowDown`/`ArrowUpDown` — the snag table's column sort indicators (§ Sticky columns / `snag-table.tsx`). `ChevronDownIcon`/`ChevronUpIcon`/`CheckIcon` — inside `ui/select.tsx` only, part of the generated shadcn primitive, not hand-picked for this app.

Nothing else in the app renders an icon — no icon on buttons like "Save"/"Cancel"/"Add snag", no icons in the sidebar's warehouse list, no icons on status/severity badges. Text and colour alone carry those, consistent with the Quality floor rule that colour is never the sole carrier of meaning (badges still get a text label) but the inverse also holds here in practice — most controls carry no icon at all.

### Screen-by-screen layout — as built

Most screens share one **page container** pattern, applied inline at each `page.tsx` rather than as a shared component: `mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 sm:py-8 lg:px-[50px]`. Three exceptions, verified by reading each page file rather than assumed from the pattern: the four auth pages (§5.1's pattern: a single centered `max-w-[340px]` card, no page container at all); **Import**, which uses a narrower centered card (`max-w-xl sm:max-w-3xl lg:max-w-4xl`); and **About the page**, capped at `max-w-screen-md`. **Add Snag uses the same full-width `max-w-screen-2xl` container as Landing and Warehouse detail** — despite visually reading as a narrow centered form (the card inside it just doesn't stretch to fill the space), it is not actually a narrow-container page, and it's the one screen most likely to be mis-copied as matching Import's container by a rebuild working from a general impression rather than the actual class.

**Landing (`/`)** — page container, then: a 2-up summary strip (`grid-cols-1 sm:grid-cols-2`, gap `2.5`) — left card is all-warehouses totals (Open/Open High/Raised, three numbers in a row), right card is "Next to launch"; then a `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3` warehouse-card grid, gap `2.5`. Empty state (§5.9) replaces the entire grid area, centered, when zero warehouses are readable.

**Warehouse detail** — page container. Header row (`mb-3 flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:justify-between` — **stacks below `sm`** as of Sep 2026): warehouse name left, go-live date + editor/history-icon right. The name is `text-[21px] font-semibold tracking-[-0.015em]` (bumped up Sep 2026). Then a two-column grid at `lg:` (`grid-cols-1 lg:grid-cols-[0.85fr_1.15fr]`, gap `2.5`): left column is a `grid-cols-2` metrics tile grid (4 small tiles + one full-width "Days left for launch" tile spanning both columns), right column is the burn-up chart. The summary tiles are `flex items-center gap-2.5` — a big `font-mono text-[28px] leading-none` number with an `text-[11px]` label **to its right**, not stacked (Sep 2026). Below that: the optional raised-snag banner, then a filter/search/action row (`flex flex-wrap items-center gap-2`, actions pushed right via `ml-auto`; the filters themselves collapse behind a "Filters · N" button below `sm` — see "Responsive" below), the "click a row" hint, the snag table, then — new Sep 2026 — the **Handover documents** card and the **Machine and Controller Details** card (both `overflow-hidden rounded-card border bg-card` with a `bg-line` header strip matching the snag-table header, collapsible / inline-editable — see `PLAN.md` §5.7.2), and finally the Team block on its own, `mt-3`, below everything else (§5.7, §14.2). The Team block also got the same `bg-line` header strip + Expand/Collapse button treatment so the three end-of-page cards read as a set.

**Add Snag** (`/warehouses/[id]/snags/new`) — **standard full-width page container** (`max-w-screen-2xl`, not narrow — see the correction above), one card inside it (`rounded-card border bg-card p-5 sm:p-7`) that doesn't stretch to fill the width, which is what makes it *read* as a narrow form. Inside the card: h1 "Raise a snag", subtitle = warehouse name, then the form: a 2-up grid (`grid-cols-1 sm:grid-cols-2`) pairing Description with Photos, then Sub-category full-width (radio cards, `flex flex-wrap`, min-height 56px each per the glove-tap-target rule), then a second 2-up grid (`grid-cols-1 sm:grid-cols-2`) holding Category/Location/Scope/Severity as four stacked radio-card groups, Severity's group carrying the "High means this stops the warehouse launching." line directly beneath it. Footer: a top border (`border-t border-line-soft pt-3.5`) then right-aligned Cancel/Raise snag buttons, both `min-h-14`.

**Import** (`/warehouses/[id]/import`) — the genuinely narrow-container screen (`max-w-xl sm:max-w-3xl lg:max-w-4xl`, see the correction above — this is the one Add Snag is *not*), one card, same h1+subtitle-as-warehouse-name pattern as Add Snag, but a much simpler body: template download, file upload dropzone, Cancel/Import snags buttons.

**Warehouse Management** (`/warehouses/manage`) — page container, h1 "Warehouse management" (`mb-4`), then: a bordered card (`mb-5 rounded-card border bg-card p-4`) holding the "Add new warehouse code" label, a `max-w-xs` text input, and the Create button in one `flex flex-wrap gap-2` row; then a `flex items-center justify-between` row pairing the status filter with the "Click a row to see its status history." hint; then the warehouse table.

**People Management** (`/admin/users`) — page container, header row (`flex items-baseline justify-between`, `mb-1`) with h1 "People" left and the **"N active · N deactivated"** count right (was "N active · N invited" — corrected 18 Sep 2026: status is binary now, there's no third "invited" count to show, PLAN.md §5.6); a subtitle paragraph (`max-w-[60ch]`, §5.9); the invite form (email input, Role select, Warehouse multi-select, Send invite button, all in one `flex flex-wrap items-center gap-2` row); the "Click a row to see its change history." hint; the table.

**About the page** (`/about`) — page container capped narrower (`max-w-screen-md`); h1, then **two** intro paragraphs (the second states plainly that there's no raise/fix split — anyone tagged can do every task). **Rewritten Sep 2026** for the role-flatten: the old `grid-cols-1 sm:grid-cols-2` Reporters/Resolvers two-card grid is gone. Now three stacked full-width cards (`rounded-card border bg-card p-4`, `mt-3` between them): "On a snag, anyone tagged can" (7-item list), "Everyone tagged to a warehouse" (handover docs + chambers), and "The roles people hold" (all 6 `MEMBER_ROLES` chips via `ROLE_COLOR_CLASS`, `REPORTER_ROLES` first and the rest `order-last`, framed as chat-side + badge-colour labels only). Chips are `rounded-pill border px-2 py-1.5 text-[11px] sm:py-0.5` (the taller padding below `sm` is the same touch-target reasoning as Button `sm`). Still never mentions Dashboard Admin.

### Responsive — as built (Sep 2026)

Before this pass the app was "responsive to 375px" mostly by virtue of the mobile-first raise flow (§5.8) and flex-wrap; the dashboard itself (sidebar, wide tables, filter bar) assumed a laptop. This pass made the dashboard usable on phone and tablet widths. Breakpoints are Tailwind defaults (`sm` 640, `md` 768, `lg` 1024). Nothing here is a separate mobile layout — same DOM, breakpoint utilities only.

- **Viewport.** `src/app/layout.tsx` now exports `viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FFF9F7" }` (the `--ground` tone). Pinch-zoom is left enabled — no `maximumScale`.
- **App shell.** Hover rail at `md+`; off-canvas drawer with backdrop below `md` (see "Sidebar"). Top bar gains a hamburger (`md:hidden`), truncates the title, and hides the user name below `sm`.
- **Snag table.** Nine lower-priority columns are `hidden md:table-cell` (Raised, Raised by, Category, Sub-category, Location, Scope, Update, ETC, Age); S.No, Description, Severity, Status always show. Column-sort icons and the expand-to-chat behaviour are unchanged. Header label "Description" still renders as "Description of SNAG issue" (via `HEADER_LABEL` in `snag-table.tsx`).
- **Admin tables.** People and Warehouse-management tables hide their Warehouse column below `sm` (`hidden sm:table-cell` on head + cell).
- **Filter bar.** `snag-filters.tsx` renders a single "Filters" button below `sm` (tinted + count when any filter is active) that toggles the six `MultiSelectFilter`s; at `sm+` they're always shown inline as before.
- **Tap targets.** Button `sm` size is `h-9` below `sm`, `h-7` at `sm+` (see Button primitive). The small `×` remove controls in the two new cards are a 36px box below `sm` (`h-9 w-9`), 24px at `sm+`. Role chips on About and the two cards use `py-1.5` below `sm`, `py-0.5` at `sm+`.
- **Two new cards.** Machine/Controller rows are a 7-track `sm:grid` that collapses to `grid-cols-1` below `sm`, with a per-cell `sm:hidden` `CellLabel` on every input and display cell (the column header row is `hidden … sm:grid`, so without the per-cell labels a phone user would see unlabelled fields).
- **Warehouse-detail header** stacks (`flex-col … sm:flex-row`) below `sm`.

### Component map

Where each design element lives:

| Element | File |
|---|---|
| Readiness thermometer | `components/thermometer.tsx` |
| Landing card | `components/warehouse-card.tsx` |
| Team block (inline expand) | `components/team-block.tsx` |
| Burn-up chart | `components/burn-up-chart.tsx` |
| Snag table and rows | `components/snag-table.tsx`, `snag-row.tsx` |
| Update thread (chat feed + compose box) | `components/snag-row.tsx` (feed/bubbles), `snag-compose.tsx` (compose box) |
| Sticky column classes | `lib/table-sticky.ts` |
| RAG colour and card sort | `lib/readiness.ts` |
| Photo capture and annotation | `components/photo-capture.tsx` |
| Video capture | `components/video-capture.tsx` |
| Duplicate warning modal | `components/duplicate-check-modal.tsx` |
| Offline queue and sync banner | `lib/offline-queue.ts`, `lib/sync-queue.ts`, `components/pending-sync-banner.tsx` |
| Excel import/export | `lib/excel.ts`, `components/export-button.tsx` |
| Searchable role/warehouse picker — **unused, dead code** (`PLAN.md` §5.4a) | `components/role-people-picker.tsx` |
| Multi-select table filter | `components/multi-select-filter.tsx` |
| Snag-raised banner | `app/(app)/warehouses/[id]/raised-banner.tsx` |
| Fixed role colours | `lib/roles.ts` |
| Warehouse management (create, activate/deactivate, status history) | `app/(app)/warehouses/manage/warehouse-code-manager.tsx`, `warehouse-row.tsx`, `status-filter.tsx` |
| Go-live date inline editor | `components/go-live-editor.tsx` |
| Go-live date hover history | `app/(app)/warehouses/[id]/go-live-history-info.tsx` |
| About the page (roles explainer) | `app/(app)/about/page.tsx` |
| Snag table search | `components/search-box.tsx` |
| People row (expandable change history) | `app/(app)/admin/users/person-row.tsx` |
| Handover documents card (collapsible, per-row History modal) | `app/(app)/warehouses/[id]/handover-documents.tsx` |
| Machine and Controller Details card (inline add/edit rows) | `app/(app)/warehouses/[id]/chamber-details.tsx` |
| Handover / chamber server actions + activity audit | `app/(app)/warehouses/[id]/asset-actions.ts` |
| Snag-table filter collapse (mobile) | `app/(app)/warehouses/[id]/snag-filters.tsx` |

### Readiness thresholds

The RAG formula in `lib/readiness.ts` uses named constants rather than inline numbers, so a future per-site settings screen can change them without touching the logic:

```
OPEN_PCT_THRESHOLD = 0.25
NEAR_LAUNCH_DAYS   = 14
```

Order of evaluation: no go-live date → grey. Any open high, or the date has passed with snags still open → red. Open percentage above threshold, or under 14 days with snags open → amber. Otherwise green.
