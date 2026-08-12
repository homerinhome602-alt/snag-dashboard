# Frozen Warehouse Launch Readiness

**Domain:** Frozen / cold-storage warehouse launches
**Status:** **Built.** All ten phases shipped — see §14 for what landed and where the build diverged from this plan.
**Stack (as built):** Next.js App Router + TypeScript + Tailwind + shadcn/ui · Supabase (Auth / Postgres / Storage)

> This document is both the specification and the record. Sections marked **as built** were reconciled against the running code and database on 9 Aug 2026, most recently updated 11 Aug 2026 for the warehouse-scoped visibility, onboarding, and audit-history round. Where the build diverged from the original plan, the divergence is described rather than quietly overwritten — the reasoning matters more than the tidiness.

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

### 2.2 Dashboard Admin — **narrowed, then widened for snag actions (12 Aug 2026)**

The Dashboard Admin role originally granted **three** powers, and nothing else:

1. **User Management** — invite, assign, deactivate
2. **Add Warehouse** — create warehouses and tag people
3. **Correct `date_raised`** on any snag — a deliberate, narrow data-correction exception

Original rationale for stopping there: keep operational accountability with the named people tagged to a warehouse rather than concentrating it in a super-user, and make sure the audit trail records a real per-warehouse role for every action.

**As built, this was deliberately widened.** Requested and confirmed explicitly for every Dashboard Admin (not one account): admin status now also bypasses the reporter/resolver tag on **every** snag-adjacent write path, not just the obvious four RPCs. A follow-up audit (same day) found the first pass incomplete and closed three more gaps:

- The four snag RPCs — `raise_snag`, `post_snag_update`, `verify_snag_closure`, `close_snag_directly` — each accept `private.is_dashboard_admin()` as an alternative to the warehouse-scoped role check, mirroring the read-bypass pattern that already existed.
- `set_go_live_date` had the same gap — the UI already showed the editor to admins (since `isResolver` ORs in admin status), which would have been a button that renders but fails on submit. Fixed to match.
- Photo/video attachments don't go through an RPC — they're a direct PostgREST insert into `attachments` plus a direct Storage upload, so the RPC fix didn't reach them. Both `attachments`'s own INSERT policy and the `storage.objects` INSERT policy for the `attachments` bucket needed the same `is_dashboard_admin()` OR added, or an admin's upload would 403 silently after the snag/update itself succeeded.

The three pages that gate their own UI on reporter/resolver status (`warehouses/[id]/page.tsx`, `snags/new/page.tsx`, `import/page.tsx`) all OR in the same admin check, so the buttons and the RPCs agree. Verified two ways: live end-to-end (raised, then deleted, a real snag as Dashboard Admin on a warehouse with zero membership) and by a database-wide query for every RLS policy and `SECURITY DEFINER` function still referencing `is_reporter`/`is_resolver` without `is_dashboard_admin` — zero remaining after the fixes above. `snag_activity` still records the admin's own `actor_id`, so the audit trail stays accurate even though the accountability boundary is gone.

Read access remains the other place Dashboard Admin status does something automatically: an admin can read every snag in every warehouse without being tagged to any of them (§2.3). A non-admin user with no `warehouse_members` row anywhere sees nothing.

Power 3 (`date_raised` correction) predates this change and is unaffected — a wrong raise date distorts ageing and burn-down for everyone and there is no one else positioned to fix it. Every such edit is written to `snag_activity` with the old and new value.

### 2.3 Visibility — **changed twice**

> **A user can only read a warehouse's data if they are tagged to it, or hold Dashboard Admin.**
> Only users **tagged to a warehouse** can raise snags or post updates there.

The plan originally scoped reads to membership. Partway through the build this was deliberately opened up ("everyone reads everything") to keep read RLS simple. Live use showed that was wrong — anyone signed in could see every warehouse's snags, team, and history regardless of assignment — so it was reverted back to scoped reads. This is the second and current position; do not open it again without discussing the tradeoff.

**As built**, the scoping is `private.is_dashboard_admin() OR private.is_warehouse_member(warehouse_id)`, applied to `warehouses`, `warehouse_members`, `snags`, `snag_updates`, `attachments`, `snag_activity`, and `snag_daily_snapshot`. Consequences:

- The sidebar and landing page list only warehouses the current user is tagged to — **except** for Dashboard Admins, who see all of them (read access is their one form of implicit reach; see §2.2)
- `Add Snag` appears only on warehouses where you are tagged as HVAC/Operations
- `Add Update` appears only on warehouses where you are tagged as a resolver
- `warehouse_readiness` — the view behind the landing cards and sidebar, joining `warehouses` to a `snags` aggregate — is a view, and views in Postgres run with the *owner's* row-security context by default, not the querying user's. It's owned by `postgres`, which has `BYPASSRLS`, so it was silently ignoring every policy above regardless of who queried it. Fixed with `ALTER VIEW ... SET (security_invoker = true)`. Any future view over an RLS-protected table needs the same treatment, checked explicitly — it will not fail loudly, it will just quietly leak.

**Verified against a real non-admin account** (12 Aug 2026), by simulating that user's session directly against Postgres (`set local role authenticated` + `request.jwt.claim.sub`, inside a rolled-back transaction — no data touched) rather than a manual browser walkthrough: every scoped table returned exactly the rows belonging to their one tagged warehouse, matching row for row against an admin-context count filtered to that warehouse_id — not a subset, not a leak. `invitations` and `warehouse_activity` (admin-only) returned zero rows. The same simulation for the Dashboard Admin account confirmed the bypass still returns everything. This closes the gap previously noted below.

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
| `grant_dashboard_admin` | boolean — **as built**, not in the original plan |
| `warehouse_id` | uuid FK → warehouses, nullable — **as built**, not in the original plan |
| `invited_by` | uuid FK → profiles |
| `created_at` / `accepted_at` | timestamptz |

**`grant_dashboard_admin` is a build-time addition.** The original plan had no way to create a second admin: `is_dashboard_admin` lived only on `profiles`, and nothing wrote to it after the bootstrap seed. Ticking this box on the invitation makes the person an admin the moment they first sign in. `set_dashboard_admin()` covers the after-the-fact case.

**`warehouse_id` is a build-time addition, added for the same reason.** Onboarding originally required two trips — invite the person here with a role, then separately go to Manage warehouse (§5.5) to tag them onto one. Picking a warehouse alongside the role at invite time does both in one step: `handle_new_user()` inserts the matching `warehouse_members` row (using this warehouse and the invitation's `default_role`) right after it creates the profile. Leaving the warehouse unset is still valid — an admin-only invitation, or someone who'll be tagged onto a warehouse later via Manage warehouse, needs no warehouse here.

Admin enters **email + role** (+ optionally warehouse), one-to-one. On first sign-in — by **either** method — a trigger matches `auth.users.email` against this table and creates the `profiles` row. **No matching invitation → access denied.**

### 3.3 `warehouses`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text unique | |
| `go_live_date` | date **nullable** | Set by resolvers from the warehouse screen, not at creation |
| `snag_counter` | int default 0 | Backs per-warehouse serial numbers |
| `site_location` | text | Optional. **As built** — dropped from both the create and rename forms after feedback; the column and RPC parameter still exist (always passed `null`) but nothing in the UI sets it |
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

**This table is the authority on permissions, and now on read access too (§2.3).** Every write check reads it: "does `auth.uid()` hold a reporter role in this warehouse?" A user with no row here for a given warehouse cannot read it or write to it — Dashboard Admins are the one exception, and only for reads (§2.2).

Rows are populated two ways: directly, via Manage warehouse (§5.5) adding or removing people from an existing warehouse's team; or automatically, when someone with an invitation carrying a `warehouse_id` (§3.2) signs in for the first time.

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

> **As built — there are now two routes to `closed`, not one.**
>
> The plan above describes the *review* route, and it still works exactly as written via `verify_snag_closure()`, which refuses to run unless the snag is sitting in `ready_to_close`.
>
> A second route was added during the build: **`close_snag_directly()`** lets any tagged reporter close a snag from **any** status — `open`, `wip` or `ready_to_close` — without waiting for a resolver to stage it. It stamps `verified_by` and `verified_at` the same way and logs the same `verify_closure` activity row, so the audit trail is indistinguishable.
>
> The consequence worth understanding: **`ready_to_close` is now optional rather than mandatory.** A snag can go straight from `open` to `closed` in one action. The gate that survives is *who* — closure is still reporter-only, and a resolver still cannot close their own work. That was the point of the verification step, and it is intact. What was given up is the guarantee that every closure was explicitly staged for review first.

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
Append-only audit log: actor, action, field, old value, new value, timestamp. Every RPC that changes a snag writes here — raise, status change, ETC update, verify/reject closure, direct close, duplicate-suppressed.

**As built** — this table existed from Phase 0 but had no viewer until a later round. Each expanded snag row now has a "View history" toggle rendering these rows as plain-English lines (`{actor} moved status from Open to WIP · 08 Aug 19:05`), sourced entirely from this table with no schema change. See `describeActivity()` in `snag-row.tsx` for the action → sentence mapping.

---

## 4. Column-level permissions

Reporters and resolvers write different columns of the same row, and Postgres RLS is row-level only. All writes therefore go through RPC functions, each accepting only its role's fields and checking `auth.uid()` membership internally:

- `raise_snag(...)` — any reporter tagged to the warehouse; allocates serial number, stamps `date_raised` and `raised_by`, records suppressed duplicate ids
- `post_snag_update(...)` — any resolver tagged to the warehouse; inserts into `snag_updates`, optionally sets `etc_date`/status
- `verify_snag_closure(snag_id, approved)` — any tagged reporter; requires `ready_to_close`
- `close_snag_directly(snag_id)` — **as built**; any tagged reporter, from any status (§3.9)
- `set_go_live_date(warehouse_id, date)` — any resolver tagged to the warehouse
- `correct_date_raised(snag_id, new_date)` — **Dashboard Admin only**; writes to `snag_activity`
- `find_similar_snags(...)` — duplicate detection (§7)
- `create_warehouse(name, site_location, members)` — admin; warehouse + member rows in one transaction
- `set_user_active(user_id, is_active)` · `set_dashboard_admin(user_id, is_admin)` — admin
- `refresh_snag_daily_snapshot()` — called by the `pg_cron` job

Note that none of these accept a Dashboard Admin bypass except `correct_date_raised`. An admin who has not tagged themselves into a warehouse is rejected by the same check as anyone else.

### 4.1 As built — the rule applies to snags, not to everything

The "never a raw `UPDATE`" rule turned out to be the right constraint for **snag data** and the wrong one for **administration**. What actually shipped is a deliberate split:

| Tables | Write path | Enforced by |
|---|---|---|
| `snags`, `snag_updates` | **RPC only** | No `UPDATE` or `DELETE` policy exists at all — direct writes are impossible, not merely discouraged |
| `warehouses`, `warehouse_members`, `invitations` | Direct table access | Admin-only RLS policies on insert / update / delete |
| `attachments` | Direct insert | Member-scoped insert policy; select open to all |

The reasoning: the RPCs exist to stop one role overwriting another role's columns on a shared row. Warehouse and user administration has no such problem — it is admin-only end to end, so a policy expresses the rule more simply than a function would.

Worth knowing when reading the code: warehouse rename, delete, and member add/remove are plain PostgREST calls in `warehouses/manage/actions.ts`, not RPCs. That is intentional, not an oversight.

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
Top bar: **Frozen Warehouse Launch Readiness**. Shows the warehouses the current user can read (§2.3) — all of them for a Dashboard Admin, only tagged ones otherwise.

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
- Heading **Warehouses**, then every warehouse the current user can read (§2.3) — all of them for a Dashboard Admin, only tagged ones otherwise
- **Warehouse management** — Dashboard Admin only. Renamed from "+ Add Warehouse" once the screen grew Manage-existing capability (§5.5)
- **User Management** — Dashboard Admin only, lives here per your instruction

### 5.4 Add Warehouse (Admin only)

**As built** — this is the "Add new" tab of **Warehouse management** (renamed from a standalone "Add Warehouse" screen once Manage-existing, §5.5, was added alongside it).

Name (no site location — see §3.3) + six **searchable multi-select** pickers: Operations, HVAC Engineer, Program Manager (Infra), PMC, PMO, Warehouse Admin. Each accepts **any number of people** — three HVAC engineers on one warehouse is normal. Selected people render as role-coloured chips, matching the six fixed role colours used everywhere else in the product (team block, table, pickers).

Each picker lists all active users, sorted so that people whose `default_role` matches the slot appear first — a hint, not a restriction. Each has an inline "invite" escape hatch. **No go-live date field** — resolvers set it later from the detail screen.

**"Add me" affordance:** because Dashboard Admin grants no operational rights (§2.2), the form needs a prominent one-click way for the admin to tag themselves into a role on the warehouse they are creating. Without it, an admin creates a warehouse they cannot then participate in — and the failure would only become obvious later, from the detail screen, which is a bad time to discover it.

### 5.5 Manage warehouse — **as built**, not in the original plan

The original plan covered creation only. Three management capabilities were added during the build, all Dashboard Admin only, all on the manage screen:

| Action | Notes |
|---|---|
| **Rename** | Plain update on `warehouses.name`. Empty names rejected client-side |
| **Add / remove members** | Insert and delete on `warehouse_members`, so a team can change after creation. Existing member chips show a × to remove; add-only was the original scope, remove was added on feedback |
| **Delete warehouse** | Two-step confirm ("Delete warehouse" → "Delete \"X\"? This can't be undone." + Cancel / Yes, delete). ⚠️ See the warning below |

#### ⚠️ Deleting a warehouse is destructive and irreversible

`snags.warehouse_id` carries `ON DELETE CASCADE`, and every snag child table cascades in turn. Deleting one warehouse silently destroys:

```
warehouses
 └── snags                → snag_updates      → attachments
                          → snag_activity     (the audit trail)
                          → attachments
 └── warehouse_members
 └── snag_daily_snapshot  (all burn-up history)
```

There is no soft delete and no archive — only the two-step confirm above stands between a click and permanent loss. **The audit trail goes with it** — which is precisely the record you would want if a deletion were ever disputed.

This sits awkwardly against the deliberate "deactivate, never delete" rule for users in §5.6, where preserving history was the stated reason. The same argument applies at least as strongly to a warehouse carrying months of snags.

**Recommended follow-up:** add `warehouses.archived_at` and filter archived sites out of the sidebar and landing grid, reserving hard delete for genuine mistakes made minutes after creation. Deliberately recorded here rather than silently fixed, because it is a product decision, not a bug.

### 5.6 User Management (Admin only)
Table of invitations: email, default role, **warehouse** (§3.2), status (invited / active / deactivated), and Dashboard Admin status. Add a row = email + role + optional warehouse, one-to-one.

**As built:**
- **Warehouse column** shows the pending assignment (`"{name} (pending)"`) for invited-not-yet-signed-up rows, and the real, possibly-multiple current `warehouse_members` list for active ones — not the stale invitation value, since Manage warehouse can change membership after signup
- **Make/Revoke admin** is a button beside the person's email, not a separate action column — toggles `is_dashboard_admin` directly for anyone with a profile (i.e. anyone past `status = invited`)
- Deactivate rather than delete, to preserve snag history

### 5.7 Warehouse detail
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

**Snag table columns, as built:**
S.No · Date Raised · Description · Raised By · Category · Sub-category · Location · Scope · Severity · Status · Update · ETC · **Ageing**

S.No, Date and Description are reordered to the front and pinned (§ sticky columns, `DESIGN.md`) — Raised By moved to fourth to make room. Column order otherwise matches the plan.

- **Ageing** shown in days, colour-banded
- **Overdue ETC flagged** — red badge when `etc_date` has passed and the snag is not closed
- Filter, sort, search across every column — filters are multi-select (§14.2)
- `Add Snag` / `Add Update` shown only if you are tagged here
- Expanding a row shows the update timeline, a "Close snag" action for tagged reporters (any status, not just `ready_to_close` — §3.9), and a "View history" toggle (§3.13)

---

### 5.8 Mobile-first snag raising

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
| Status | Resolvers drive to `ready_to_close`; **any tagged reporter** verifies closure — or closes directly from any status (§3.9) |
| Visibility | Scoped to warehouse membership; Dashboard Admin reads everything (§2.3) |
| Dashboard Admin scope | User management + create/rename/delete warehouse + correct `date_raised` + read everywhere. Must self-tag for any write |
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

**The burn-up is the only chart in the product.** It lives at the top of the warehouse detail screen (§5.7) — not on the landing page, and nowhere else.

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

---

## 14. Implementation status — as built

All ten phases shipped, then eight further rounds of live feedback and fixes (2ce86fb → 900ee51 at last count). 17 migrations applied — `supabase migration list`, or `mcp__supabase__list_migrations`, is the source of truth; this document does not try to enumerate them.

| Phase | Commit | State |
|---|---|---|
| 0 · Schema, enums, RLS, RPCs, `pg_cron` snapshot | *(migrations)* | ✅ |
| 1 · Auth, invitation gate, User Management | `78eb080`, `2501ada` | ✅ |
| 2 · Warehouse CRUD, sidebar, landing cards | `800c15b` | ✅ |
| 3 · Snag table, Add Snag | `bf4b5a9` | ✅ |
| 4 · Header: team, metrics, burn-up | `eb99d6e` | ✅ |
| 5 · Update log, resolver inline editing, verify | `0173e4a` | ✅ |
| 6 · Photo upload, annotation, video on updates | `baf7aeb` | ✅ |
| 7 · Mobile raise flow, offline queue | `313afa2` | ✅ |
| 8 · Duplicate detection | `41d0fe6` | ✅ |
| 9 · Excel export and import | `9149ed4` | ✅ |

### 14.1 Where the build diverged from this plan

Each is documented in place above; collected here so nothing is missed on a skim.

| Divergence | Section |
|---|---|
| `close_snag_directly()` — `ready_to_close` became optional | §3.9 |
| `invitations.grant_dashboard_admin` — admin granted at invite time | §3.2 |
| `invitations.warehouse_id` — warehouse assigned at invite time, provisioned on signup | §3.2, §3.4 |
| Visibility opened to everyone, then reverted back to scoped reads | §2.3 |
| RPC-only rule applies to snags; admin tables use direct access + RLS | §4.1 |
| Warehouse rename, delete, and member management added | §5.5 |
| Warehouse delete cascades destructively, including the audit trail | §5.5 ⚠️ |
| `snag_activity` gained a viewer ("View history") — table itself unchanged | §3.13 |
| Dashboard Admin gained a fourth power: bypass reporter/resolver on all snag RPCs | §2.2 |

### 14.2 UI behaviour added after the plan was written

None of this changes the data model (except where noted in §14.1); it came out of live testing and is recorded so it is not mistaken for undocumented drift.

- **Sticky columns** — S.No, Date and Description pin to the left edge while the remaining columns scroll under them. Fixed pixel widths (60 / 70 / 290 = 420px); see `lib/table-sticky.ts` for why percentages could not be used. A row's own expanded content can't be pinned the same way — `position: sticky` does not work on a cell spanning the full row width, a real browser limitation rather than a bug in this codebase — so expanding a row resets the table's horizontal scroll instead, which keeps the newly-opened content on screen.
- **Collapsible sidebar** — collapses to an icon rail, content fully hidden rather than clipped, with a Home button (shown only while the rail is open) and sticky pin behaviour so it and the top header stay in place while the page scrolls.
- **Team block** — expands **inline**, pushing the rest of the header down, with a close button in the top-right of the expanded box. (An earlier round tried an overlay that floated over the page instead; reverted back to inline on feedback — see the "changed twice" pattern in §2.3.)
- **"Timeline"** — the UI name for what this document calls the update log. Each entry is a bulleted, dot-and-line-connected item; a photo attached at raise time (no update posted yet) still gets its own dot, tagged "Description."
- **Filters are multi-select**, not single-value — every snag-table filter (status, category, sub-category, location, scope, severity) accepts more than one value at once.
- **Multi-select filters, search box, Export/Import/Add-snag** all share a single row rather than stacking on separate lines.
- **Snag-raised confirmation** — a banner appears after raising a snag and dismisses itself after 5 seconds with an animated exit rather than disappearing instantly.
- Dashboard card split (all-warehouses totals vs. next-to-launch), hover-pop on cards, standardised laptop-viewport padding (50px), description tag in the table, Add Snag form starts with no field pre-selected.

### 14.3 Known gaps

- **Migrations are not in version control.** They exist only in the Supabase project. `npx supabase db pull` writes them to `supabase/migrations/` — do this before any environment move.
- **No soft delete for warehouses** (§5.5).
- **Category and scope are deferred on mobile**, so they are nullable for mobile-raised snags. The "finish this snag" prompt back at a desk was never built.
- **Notifications** were never started — overdue ETC is visible in the UI but nothing reaches the person who can act on it.
- **Password-reset email deliverability depends on a one-time Supabase dashboard step.** The "Reset Password" email template still needs its link changed to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/update-password`, since the default template points at Supabase's hosted verify page, which can't set a session cookie on this app's own domain. Supabase's built-in email sending is also heavily rate-limited — fine for testing, not for production volume.
