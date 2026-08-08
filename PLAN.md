# Frozen Warehouse Launch Readiness

**Domain:** Frozen / cold-storage warehouse launches
**Status:** Planning only — no code yet
**Stack (proposed):** Next.js + TypeScript + Tailwind + shadcn/ui · Supabase (Auth / Postgres / Storage) · ImageKit (media delivery)

---

## 1. Design decision carried forward

One `snags` table keyed by `warehouse_id`, **not** a physical table per warehouse. The UI renders a table per warehouse; the data stays in one queryable place. This is what makes the cross-warehouse landing cards and roll-up stats possible at all.

---

## 2. Roles and visibility

### 2.1 Roles

**Roles are per warehouse.** A person's capability is decided by their `warehouse_members.role` in *that* warehouse — so someone can be Program Manager (Infra) on one warehouse and PMO on another. `Dashboard Admin` is the one exception: it is global, held on `profiles`.

| Category | Roles (per warehouse) | Rights in that warehouse |
|---|---|---|
| **Reporters** | HVAC Engineer, Operations | Raise snags: description, category, sub-category, location, scope, **severity**, photos |
| **Resolvers** | Program Manager (Infra), PMC, PMO, Warehouse Admin | Post updates (with media), set ETC, set **go-live date**, move status to WIP / Ready to Close |

Consequence: "reporter" and "resolver" are not properties of a user, they are properties of a **user-warehouse pair**. Every permission check must therefore name a warehouse. The same person can see `Add Snag` on one warehouse and `Add Update` on another.

### 2.2 Dashboard Admin is deliberately narrow

The Dashboard Admin role grants **three** powers, and nothing else:

1. **User Management** — invite, assign, deactivate
2. **Add Warehouse** — create warehouses and tag people
3. **Correct `date_raised`** on any snag — a deliberate, narrow data-correction exception

It does **not** confer the ability to raise snags, post updates, set ETC, set go-live dates, or change status. To do any of those, the admin must **tag themselves into the warehouse** in a role, at creation time, like anyone else. Their admin status grants no shortcut.

Read access is unaffected — like every user, an admin can read every snag in every warehouse.

Rationale: this keeps operational accountability with the named people rather than concentrating it in a super-user, and it means the audit trail records a real role for every action. Power 3 is the single exception, because a wrong raise date distorts ageing and burn-down for everyone and there is no one else positioned to fix it. Every such edit is written to `snag_activity` with the old and new value.

### 2.3 Visibility — **changed**

> **Everyone can read every snag in every warehouse.**
> Only users **tagged to a warehouse** can raise snags or post updates there.

This is a deliberate reversal of the earlier scoped-read model. Consequences:

- The sidebar lists **all** warehouses for **all** users
- The landing page shows **all** warehouse cards to everyone
- `Add Snag` appears only on warehouses where you are tagged as HVAC/Operations
- `Add Update` appears only on warehouses where you are tagged as a resolver
- Read RLS becomes trivially simple; write RLS carries all the logic

---

## 3. Schema

### 3.1 `profiles`
Extends Supabase `auth.users`, created on first sign-in.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | FK → `auth.users.id` |
| `email` | text unique | The join key to `invitations` |
| `full_name` | text | From Google profile, or entered on password signup |
| `is_dashboard_admin` | boolean | The only **global** role |
| `default_role` | enum | Pre-selected in the Add Warehouse pickers; not authoritative |
| `is_active` | boolean | Deactivate leavers without deleting history |
| `created_at` | timestamptz | |

The admin still enters one email + one role on the User Management screen — that value lands in `default_role`. The **authoritative** role is per warehouse, in `warehouse_members`.

### 3.2 `invitations`
Backs the admin User Management screen and gates Google sign-in.

| Column | Type |
|---|---|
| `id` | uuid PK |
| `email` | text unique |
| `default_role` | enum |
| `invited_by` | uuid FK → profiles |
| `created_at` / `accepted_at` | timestamptz |

Admin enters **email + role**, one-to-one. On first sign-in — by **either** method — a trigger matches `auth.users.email` against this table and creates the `profiles` row. **No matching invitation → access denied.**

### 3.3 `warehouses`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text unique | |
| `go_live_date` | date **nullable** | Set by resolvers from the warehouse screen, not at creation |
| `snag_counter` | int default 0 | Backs per-warehouse serial numbers |
| `site_location` | text | Optional |
| `created_by` | uuid FK → profiles | |
| `created_at` | timestamptz | |

The six tagged people are **not** columns here — they live in `warehouse_members`, which avoids six near-identical FK columns and lets the header block be rendered from one query.

### 3.4 `warehouse_members`
Single source of truth for both tagging and the detail-screen header.

| Column | Type |
|---|---|
| `warehouse_id` | uuid FK |
| `user_id` | uuid FK → profiles |
| `role` | enum: `operations`, `hvac_engineer`, `program_manager_infra`, `pmc`, `pmo`, `warehouse_admin` |

`UNIQUE (warehouse_id, user_id, role)` — **many people may hold the same role** in one warehouse. Three HVAC engineers and two PMCs on a single warehouse is fine. The previous one-person-per-role constraint is removed.

**`operations` is newly added** per your request.

**This table is the authority on permissions.** Every write check reads it: "does `auth.uid()` hold a reporter role in this warehouse?" A user with no row here can still read the warehouse's snags, but cannot write anything to it. Dashboard Admins are no exception (§2.2).

### 3.5 `snags`

| Column | Type | Filled by |
|---|---|---|
| `id` | uuid PK | system |
| `warehouse_id` | uuid FK | system |
| `serial_no` | int | **auto**, per warehouse (§3.10) |
| `date_raised` | date default `current_date` | auto on raise; **only Dashboard Admin may edit it**, audited |
| `raised_by` | uuid FK → profiles | **auto** from session |
| `description` | text | Reporter |
| `category` | enum `hvac`, `ops` | Reporter |
| `sub_category` | enum (§3.7) | Reporter |
| `sub_category_other` | text nullable | Reporter, when sub-category = Others |
| `location` | enum (§3.8) | Reporter |
| `scope` | enum `oem`, `infra`, `admin` | Reporter |
| `severity` | enum `high`, `medium`, `low` | Reporter |
| `status` | enum `open`, `wip`, `ready_to_close`, `closed` | §3.9 |
| `etc_date` | date nullable | Resolver |
| `verified_by` / `verified_at` | uuid / timestamptz | Reporter, on closure |
| `closed_at` | timestamptz | system |
| `created_at` / `updated_at` | timestamptz | system |

**Derived, not stored** (computed in a view so they're never stale):
- `ageing_days` = `coalesce(closed_at::date, current_date) − date_raised`
- `is_overdue` = `etc_date < current_date AND status <> 'closed'`

### 3.6 Severity

Three levels only: **High · Medium · Low**.

High is the top of the scale and drives the launch-readiness gate — it replaces the former Critical tier, so "any open High blocks a green card". Because there is no level above it, High absorbs what used to be two distinct signals, and without a stated bar the gate will fire on far more warehouses than it should.

**So the definition ships in the interface, at the point of raise.** Directly beneath the severity selector, on both the desktop and mobile raise forms:

> **High means this stops the warehouse launching.**

One line, present every time someone raises a snag, always visible rather than behind a tooltip. It defines the top of the scale by consequence rather than by feeling. Without it, High drifts to mean "annoying", the readiness colour stops discriminating, and nobody notices for months.

The same line appears on the Excel import template as a column note.

### 3.7 Sub-category
ODU · IDU · Puff panel · PLC · Door · Floor · Piping · Racks · Electrical · IoT sensors · Others

*Others* reveals a free-text box stored in `sub_category_other`.

**All eleven are always available**, regardless of whether Category is HVAC or Ops — no filtering. Accepted trade-off: reporting will contain combinations like `category = ops, sub_category = ODU`. If that becomes noisy, the fix is a soft warning at raise time rather than a hard restriction, so nothing is ever blocked.

### 3.8 Location
Frozen chamber · Ante room · ODU area · Ambient area

### 3.9 Status lifecycle

```
open ──▶ wip ──▶ ready_to_close ──▶ closed
 ▲                     │
 └──────── reopen ◀─────┘
```

Resolvers drive it up to `ready_to_close`. Confirmation to `closed` — or rejection back to `wip` — is made by **any reporter tagged to that warehouse**, not only the original raiser.

This deliberately widens verification beyond the person who raised it. Verification requires someone who can physically walk to the defect and check it, and any HVAC or Operations person tagged to that warehouse can do so. It also means no snag is ever stranded when its raiser leaves the project — no admin override is needed, and none exists.

The verifier is recorded in `verified_by`, so the audit trail still shows exactly who signed it off even when that differs from `raised_by`.

### 3.10 Serial number
Atomic increment of `warehouses.snag_counter` inside the insert transaction, with `UNIQUE (warehouse_id, serial_no)` as a backstop. The row lock serialises simultaneous raisers.

### 3.11 `snag_updates` — **new table**

Your requirement that updates accumulate over weeks with timestamps means "Update" cannot be a single column. It becomes a child table.

| Column | Type |
|---|---|
| `id` | uuid PK |
| `snag_id` | uuid FK |
| `body` | text |
| `author_id` | uuid FK → profiles |
| `created_at` | timestamptz |

In the table view the Update cell shows the **latest** entry plus a count ("3 updates"); expanding the row reveals the full chronological log. Updates are **append-only** — an edit would destroy the audit trail.

### 3.12 `attachments`
Serves both the original snag photos and media attached to individual updates.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `snag_id` | uuid FK | always set |
| `update_id` | uuid FK **nullable** | null = attached at raise; set = attached to that update |
| `media_type` | enum `image`, `video` | |
| `file_url` | text | annotated version, if annotated |
| `original_url` | text nullable | pre-annotation original, always preserved |
| `thumbnail_url` | text | |
| `file_name` / `file_size` / `duration_seconds` | | |
| `uploaded_by` | uuid FK | |
| `created_at` | timestamptz | |

### 3.13 `snag_activity`
Append-only audit log: actor, action, field, old value, new value, timestamp.

---

## 4. Column-level permissions

Reporters and resolvers write different columns of the same row, and Postgres RLS is row-level only. All writes therefore go through RPC functions, each accepting only its role's fields and checking `auth.uid()` membership internally:

- `raise_snag(...)` — any reporter tagged to the warehouse; allocates serial number, stamps `date_raised` and `raised_by`
- `post_snag_update(...)` — any resolver tagged to the warehouse; inserts into `snag_updates`, optionally sets `etc_date`/status
- `verify_snag_closure(snag_id, approved)` — **any reporter tagged to the warehouse**; records `verified_by`
- `set_go_live_date(warehouse_id, date)` — any resolver tagged to the warehouse
- `correct_date_raised(snag_id, new_date)` — **Dashboard Admin only**; writes to `snag_activity`
- `find_similar_snags(...)` — duplicate detection (§7)

Note that none of these accept a Dashboard Admin bypass except `correct_date_raised`. An admin who has not tagged themselves into a warehouse is rejected by the same check as anyone else.

Keep these in a non-exposed schema with explicit `auth.uid()` checks in the body.

---

## 5. Screens

### 5.1 Login
- **Sign in with Google** — primary
- **Email + password** — equal fallback, for third-party HVAC engineers and OEM contractors who have no Google account
- Both routes are gated by `invitations`. An uninvited email is rejected with "Your account has not been set up — contact your administrator."
- Password route needs: invite email with a set-password link, plus forgot-password

Because the gate is the email address, a user invited as `x@company.com` must sign in with exactly that address — a personal Gmail will not match. The User Management screen should say so.

### 5.2 Landing — warehouse cards
Top bar: **Frozen Warehouse Launch Readiness**. All warehouses visible to all users.

Each card shows:
- Warehouse name
- **Total snags / Open snags / Open %**
- **Go-live date** (or "Not set")
- **Open High count** — launch-readiness gate
- **Days to go-live** countdown
- **RAG colour coding** on the whole card

### 5.2.1 Launch-readiness gate

Each card carries a readiness signal answering the only question leadership asks: *can we open?*

Displayed: **total open snags · open High snags · go-live date**.

Card colour:

| Colour | Condition |
|---|---|
| **Red** | Any open High snag, **or** go-live date already passed with snags still open |
| **Amber** | No open Highs, but open % above threshold (default 25%), or fewer than 14 days to go-live with snags open |
| **Green** | No open Highs and open % at or below threshold |
| **Grey** | Go-live date not set |

The thresholds should be configurable rather than hard-coded — different sites will want different tolerances.

A **summary strip above the card grid** aggregates open, high-severity and raised across every warehouse, and calls out **the next warehouse to launch** by name — the one with the soonest go-live date and work still outstanding. That is the warehouse the portfolio is judged on, so it should not have to be found by scanning.

### 5.2.2 Card order

Cards sort by **launch proximity**, not alphabetically:

1. Warehouses **with** a go-live date, soonest first
2. Warehouses **without** a go-live date, last, ordered among themselves by **open snags descending**

A warehouse with no date cannot be assessed for readiness, so it drops below every dated one — but the busiest of them still surfaces first, because an undated warehouse carrying 40 open snags needs a date more urgently than one carrying two.

### 5.3 Collapsible sidebar
- Heading **Warehouses**, then every warehouse
- **+ Add Warehouse** — Dashboard Admin only
- **User Management** — Dashboard Admin only, lives here per your instruction

### 5.4 Add Warehouse (Admin only)
Name + six **multi-select** user pickers: Operations, HVAC Engineer, Program Manager (Infra), PMC, PMO, Warehouse Admin. Each accepts **any number of people** — three HVAC engineers on one warehouse is normal.

Each picker lists all active users, sorted so that people whose `default_role` matches the slot appear first — a hint, not a restriction. Each has an inline "invite" escape hatch. **No go-live date field** — resolvers set it later from the detail screen.

**"Add me" affordance:** because Dashboard Admin grants no operational rights (§2.2), the form needs a prominent one-click way for the admin to tag themselves into a role on the warehouse they are creating. Without it, an admin creates a warehouse they cannot then participate in — and the failure would only become obvious later, from the detail screen, which is a bad time to discover it.

### 5.5 User Management (Admin only)
Table of invitations: email, role, status (invited / active / deactivated). Add a row = email + role, one-to-one. Deactivate rather than delete, to preserve snag history.

### 5.6 Warehouse detail
Opens from a card or the sidebar.

The screen opens with a **header block above the snag table**, laid out in three parts:

**1. Team** — everyone tagged to this warehouse, grouped by role. Because a role can hold several people (§3.4), this collapses to a summary with a expand control rather than listing every name inline.

**2. Metrics** — a compact row of figures:

| Metric | Note |
|---|---|
| Total raised | |
| Open | |
| Closed | |
| Open High | Drives the readiness colour |
| Go-live date | Editable inline by resolvers |
| Days to go-live | Derived |

**3. Burn-up chart** — the only chart in the product, rendered here and nowhere else.

- Two cumulative lines: **total raised** and **total closed**; the shaded gap between them is the open count
- Runs from the warehouse's first snag to its go-live date, with the trend projected forward past today
- Answers whether the gap will reach zero by go-live, and — critically — whether a miss is caused by slow closure or by growing scope
- Reads from `snag_daily_snapshot` (§12.1), so it is a cheap query rather than an aggregation over `snags`
- Degrades gracefully: with under ~7 days of snapshots it shows "collecting data" rather than a misleading two-point line. With no go-live date set, it plots history without a target line

**Burn-down is deliberately not built.** A single-line burn-down cannot distinguish slow closure from scope growth, and in a cold-store commissioning — where snags arrive continuously as chambers are pulled to temperature — that distinction is the whole point. The burn-up shows everything a burn-down would, plus the cause.

**Snag table columns:**
S.No · Date Raised · **Raised By** · Description · Category · Sub-category · Location · Scope · Severity · Status · **Ageing** · Photo · Update · ETC

- **Ageing** shown in days, colour-banded
- **Overdue ETC flagged** — red badge when `etc_date` has passed and the snag is not closed
- Filter, sort, search across every column
- `Add Snag` / `Add Update` shown only if you are tagged here

---

### 5.7 Mobile-first snag raising

Snags are raised on the floor, not at a desk. The raise flow is designed for a phone held in a **gloved hand at −25 °C**, and the desktop version is the adaptation — not the other way round.

**Physical constraints driving the design**
- Thermal gloves defeat capacitive touch precision, and often the screen entirely
- Condensation forms on the phone when moving between chamber and ambient
- Time in a blast freezer is deliberately limited — the flow must be fast
- Warehouse wifi is unreliable at the back of a chamber

**Design responses**

| Constraint | Response |
|---|---|
| Gloves | Minimum 56 px tap targets; large radio cards for category, sub-category, location, severity — never dropdowns |
| Typing is impractical | **Camera first**: open the camera, then fill the form. Voice-to-text on description |
| Limited time in chamber | Only 6 required fields; everything else deferred. Target under 45 seconds |
| Unreliable wifi | **Offline-capable**: queue the snag locally and sync when connection returns. Show a clear pending state |
| Condensation / cold | Avoid long-press and swipe gestures; single taps only |

**Deferred to desktop:** Excel import/export, the full table view, inline resolver editing, and analytics. Phones raise snags and post updates; they are not for administration.

Offline sync has a schema consequence: the client generates the snag `id` (uuid) locally, but `serial_no` can only be allocated server-side at sync time, since it depends on the warehouse counter. The UI must therefore show "pending" rather than a number until sync completes.

---

## 6. Media handling

**Backend: Supabase Storage.** One service, sharing the same auth and RLS as the data. ImageKit stays available if delivery performance later justifies putting it in front.

- **Photo annotation before save** — canvas overlay for circling the defect; original preserved in `original_url` alongside the annotated version
- **Client-side compression before upload** — resize to a sane max dimension and re-encode. This matters more than usual: uploads happen over warehouse wifi, from a phone, in a −25 °C chamber
- **Video** needs a hard size cap and a max duration, enforced client-side before upload begins
- Thumbnails generated client-side on upload, since Supabase Storage does not transform media
- Storage buckets are private; the app serves signed URLs

---

## 7. Duplicate detection

On submit, before the snag is written:

1. Query snags in the **same warehouse + same location + same sub-category**, status not `closed`
2. Rank by text similarity on `description` using `pg_trgm`
3. Above a threshold, show a modal listing the candidates with their S.No, description, status and raiser
4. Raiser chooses **"Raise anyway"** or **"Cancel — it's the same issue"**
5. If raised anyway, record the suppressed match in `snag_activity` so repeat duplicates are visible later

Requires the `pg_trgm` extension and a GIN index on `description`.

---

## 8. Excel import / export

- **Export** — current filtered view to `.xlsx`, all columns plus ageing and overdue flag
- **Import** — download a sample template first, with the exact headers, the valid enum values per column, and one example row. Upload is validated row-by-row with errors reported per line before anything is committed.

---

## 9. Build phases

| Phase | Scope |
|---|---|
| **0** | Schema, enums, RLS, RPC functions, `pg_trgm`, **`snag_daily_snapshot` + `pg_cron` job**, seed first admin |
| **1** | Google + password auth, invitation gate, profiles, User Management |
| **2** | Warehouse CRUD with multi-select pickers, sidebar, landing cards + readiness gate |
| **3** | Snag table, Add Snag, severity/sub-category/location, ageing + overdue |
| **4** | Warehouse detail header: team, metrics, **burn-up chart** |
| **5** | Update log with timestamps, resolver inline editing |
| **6** | Photo upload + annotation, video on updates |
| **7** | Mobile raise flow, offline queue |
| **8** | Duplicate detection |
| **9** | Excel export, then import with template |

The snapshot job moves to Phase 0 deliberately — see §12.1. Everything else can be built late; that one cannot.

---

## 10. Decisions locked

| Question | Decision |
|---|---|
| Role model | **Per warehouse.** `default_role` on the invitation is a hint; `warehouse_members.role` is authoritative. Dashboard Admin is the only global role |
| Login | **Google + email/password**, both gated by the invitation list |
| Sub-category | **No filtering** — all eleven always available under both categories |
| Media storage | **Supabase Storage**, private buckets, signed URLs, client-side compression |
| Serial number | Auto, per warehouse, atomic counter |
| Status | Resolvers drive; **any tagged reporter** verifies closure |
| Visibility | Everyone reads all snags; only tagged users write |
| Dashboard Admin scope | User management + add warehouse + correct `date_raised`. Must self-tag for anything else |
| Date raised | Auto on raise; **Dashboard Admin only** may correct it, audited |
| People per role | **Many** per role per warehouse — multi-select pickers |
| Launch-readiness gate | On landing cards: total open · open High · go-live date, RAG coloured |
| Mobile | Mobile-first raise flow, offline-capable, camera-first |
| Charts | **Burn-up only**, at the top of the warehouse detail screen. No burn-down, no landing-page chart |

## 11. Assumptions made (flag if wrong)

- Updates are **append-only** — no editing or deleting past entries
- The Update column in the table shows the latest entry; the full log is in the expanded row
- Go-live date is blank on a new warehouse until a resolver sets it, and cards show "Not set"
- `Others` sub-category requires the free-text box to be filled
- Closed snags remain visible, with a filter to hide them
- A reporter may verify a snag they raised themselves — self-verification is allowed, since widening verification was the point
- Correcting `date_raised` recalculates that snag's ageing, but does **not** rewrite past `snag_daily_snapshot` rows — the chart's history stays as recorded

---

## 12. Burn-up chart

**The burn-up is the only chart in the product.** It lives at the top of the warehouse detail screen (§5.6) — not on the landing page, and nowhere else.

**How it is built**
- **X axis** — time, from the warehouse's first snag to its go-live date
- **Y axis** — cumulative snag count
- **Raised line** — every snag ever raised, cumulative. This is the scope
- **Closed line** — every snag ever closed, cumulative. This is the progress
- **The gap between them** — shaded; it is the current open count
- **Projection** — both lines' recent slopes extended to the go-live date

**Reading it**
- Gap **narrowing** → on track; the two lines converge before go-live
- Gap **steady or widening** → will not be clear on opening day
- **Raised line climbing steeply** → scope growth. Add resources and it will not help; the intake needs controlling
- **Closed line flattening** → genuine slowdown in resolution. This is the case where resources do help
- Where the projected gap meets the go-live date → predicted snags still open on opening day

**Why a burn-up and not a burn-down.** A burn-down plots only the open count. When that line stalls it is ambiguous — it cannot tell you whether the team stopped closing or new snags kept arriving, and those two problems need opposite responses. The burn-up separates them into two lines. In a frozen warehouse this matters more than usual, because snags arrive continuously as chambers are pulled to temperature and systems are commissioned; scope growth is the normal condition, not an anomaly. A chart that hides it would mislead on every warehouse. **Burn-down is not being built.**

### 12.1 Data required

A daily snapshot per warehouse, written by a `pg_cron` job:

| Column | Purpose |
|---|---|
| `warehouse_id` · `snapshot_date` | Composite key |
| `total_raised` | Cumulative — the scope line |
| `total_closed` | Cumulative — the progress line |
| `open_count` | `total_raised − total_closed`; the shaded gap |
| `open_high_count` | Also feeds the launch-readiness gate on the landing cards |

The chart derives entirely from this table, which keeps it a cheap indexed read rather than an aggregation over `snags`.

**Timing note:** the snapshot only records from the day the job is deployed, and history that was never captured cannot be recovered except by replaying `snag_activity`. The job therefore belongs in **Phase 0** with the schema, not in a later analytics phase — otherwise early warehouses will have a permanent hole at the start of their chart.

---

## 13. Further suggestions (not yet incorporated)

1. **Notifications** — email or Slack on assignment, status change, and ETC breach
2. **QR code per chamber** — scan to pre-fill warehouse + location, which pairs well with the mobile flow
3. **Cold-chain risk flag** — does this snag threaten temperature integrity? Escalates independently of severity
4. **OEM warranty expiry** on `scope = OEM` snags
5. **Bulk status update** — select multiple rows, move together
6. **Snag reassignment** — hand a snag to a different person when someone leaves
