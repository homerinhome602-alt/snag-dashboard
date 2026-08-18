# Frozen Warehouse Launch Readiness

**Domain:** Frozen / cold-storage warehouse launches
**Status:** **Built.** All ten phases shipped — see §14 for what landed and where the build diverged from this plan.
**Stack (as built):** Next.js App Router + TypeScript + Tailwind + shadcn/ui · Supabase (Auth / Postgres / Storage)

> This document is both the specification and the record. Sections marked **as built** were reconciled against the running code and database on 9 Aug 2026, most recently a full line-by-line audit against the live schema, RLS policies, and every route/component on 18 Aug 2026 (the round that found and fixed the §5.4/5.5 warehouse-management staleness and the previously-undocumented `warehouse_activity` table). Where the build diverged from the original plan, the divergence is described rather than quietly overwritten — the reasoning matters more than the tidiness.

---

## 0. Setup — what a fresh environment needs

Everything required to stand this app up from nothing, so a rebuild doesn't have to reverse-engineer it from the running instance.

**Runtime dependencies** (`package.json`, versions as pinned — see there for the exact devDependency list too, mainly Tailwind 4 and the TypeScript/ESLint toolchain):

| Package | Version | Role |
|---|---|---|
| `next` | 16.3.0 | App Router framework. **Not the Next.js in most training data** — breaking changes; middleware is renamed `proxy` (`src/proxy.ts`, matched by `AGENTS.md`'s standing instruction to read `node_modules/next/dist/docs/` before writing Next-specific code) |
| `react` / `react-dom` | 19.2.8 | |
| `@supabase/supabase-js` | ^2.112.2 | DB/Auth/Storage client |
| `@supabase/ssr` | ^0.12.4 | Cookie-based session helpers for `lib/supabase/{client,server,proxy}.ts` |
| `@base-ui/react` | ^1.7.0 | Headless primitives underlying `components/ui/*` (Select, etc.) |
| `shadcn` | ^4.16.2 | CLI/registry the `ui/` primitives were generated from |
| `tailwindcss` | ^4 (devDependency) | Utility CSS; v4's CSS-first config, no `tailwind.config.js` — tokens live in `globals.css`'s `@theme` block |
| `tailwind-merge` / `clsx` | ^3.6.0 / ^2.1.1 | Back `lib/utils.ts`'s `cn()` |
| `class-variance-authority` | ^0.7.1 | Variant styling for `ui/button.tsx` etc. |
| `lucide-react` | ^1.30.0 | Icon set (sort arrows, chevrons, etc.) |
| `exceljs` | ^4.4.0 | Import/export (§8) |
| `tw-animate-css` | ^1.4.0 | Animation utility classes |

**Environment variables** (`.env.local`, gitignored) — exactly two, both used identically in `lib/supabase/client.ts`, `server.ts`, and `proxy.ts`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

**`.mcp.json`** (committed, not secret) holds only the Supabase project ref, wiring up the `mcp__supabase__*` tools for whoever's developing — `{"mcpServers":{"supabase":{"type":"http","url":"https://mcp.supabase.com/mcp?project_ref=<ref>&features=..."}}}`.

**Postgres extensions actually used** (the project has dozens of Supabase's default-available extensions listed as installable; these are the ones actually `installed_version`-active and load-bearing):
- `pgcrypto` — `gen_random_uuid()`, every table's PK default
- `pg_trgm` — `extensions.similarity()`, duplicate detection (§7)
- `pg_cron` — the daily snapshot job (§12.1)
- `uuid-ossp` — installed alongside `pgcrypto`, not directly called by any function in this schema (`gen_random_uuid()` from `pgcrypto` is what's actually used)

**Supabase Storage:** one bucket, `attachments` — **private** (not public), 50MB (`52428800` bytes) file size limit, `allowed_mime_types` restricted to `image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `video/webm`, `video/quicktime`. Objects are served via signed URL (§6), never a public bucket URL. Path convention: `{warehouse_id}/{snag_id}/{8-char-random-id}[.ext | -thumb.jpg | -original.jpg]` — the storage INSERT policy parses `warehouse_id` back out of the path's first folder segment to run the same reporter/resolver/admin check the `attachments` table's own INSERT policy runs (§4.1), so the two must stay in sync if the path convention ever changes.

**Migrations are Supabase-project-only, not version-controlled** — see the CLAUDE.md gotcha. `mcp__supabase__list_migrations` (or `npx supabase migration list`) is the only reliable inventory; as of this audit there were 29, from `phase0_extensions_types_tables` through `move_warehouse_admin_to_reporter`.

---

## 1. Design decision carried forward

One `snags` table keyed by `warehouse_id`, **not** a physical table per warehouse. The UI renders a table per warehouse; the data stays in one queryable place. This is what makes the cross-warehouse landing cards and roll-up stats possible at all.

---

## 2. Roles and visibility

### 2.1 Roles

**Roles are per warehouse.** A person's capability is decided by their `warehouse_members.role` in *that* warehouse — so someone can be Program Manager (Infra) on one warehouse and PMO on another. `Dashboard Admin` is the one exception: it is global, held on `profiles`.

| Category | Roles (per warehouse) | Rights in that warehouse |
|---|---|---|
| **Reporters** | HVAC Engineer, Operations, Warehouse Admin | Raise snags: description, category, sub-category, location, scope, **severity**, photos |
| **Resolvers** | Program Manager (Infra), PMC, PMO | Post updates (with media), set ETC, set **go-live date**, move status to WIP / Ready to Close |

Consequence: "reporter" and "resolver" are not properties of a user, they are properties of a **user-warehouse pair**. Every permission check must therefore name a warehouse. The same person can see `Add Snag` on one warehouse and `Add Update` on another.

**Warehouse Admin moved from resolver to reporter (18 Aug 2026).** Was originally a resolver role (post updates, set ETC/status, verify closure); now classified as a reporter (raise snags, close tickets) instead — a full move, not an addition, so it no longer has resolver rights. Enforced in exactly two places, both updated together: `private.is_reporter()`/`private.is_resolver()` in Postgres (the actual authorization boundary for every RLS policy and RPC that checks role) and `REPORTER_ROLES`/`RESOLVER_ROLES` in `lib/roles.ts` (drives which controls the UI shows — must stay in sync with the Postgres functions by hand, there's no shared source of truth between the two). Verified via a rolled-back transaction simulating a `warehouse_admin`-tagged session: `is_reporter` now returns true, `is_resolver` false. `ROLE_COLOR_CLASS`'s per-role chip color is unrelated to this and was left unchanged — it's a distinct-identity color per role, not a warm/cool reporter-resolver signal.

**Narrowed for admin-assigned tagging (17 Aug 2026):** the schema still allows a person to hold different roles on different warehouses, but the admin UI no longer lets anyone create that state deliberately — §5.6's "+ Add warehouse" control treats `profiles.default_role` as a person's one and only role and rewrites their entire `warehouse_members` set to match it every time it runs. A true per-warehouse dual role would need its own explicit design, not just a different value passed to that action.

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
| `full_name` | text | Entered on password signup (§5.1 — Google sign-in was attempted and reverted; password is the only auth method built) |
| `is_dashboard_admin` | boolean default `false` | The only **global** role |
| `default_role` | enum, nullable | Set once at invite time (§3.2), null for a Dashboard Admin invite. **As built**, this became load-bearing rather than a hint: `addWarehouseMembership` (§5.6) treats it as a person's one authoritative role when tagging them onto more warehouses post-signup — see §2.1's narrowing note and the CLAUDE.md gotcha |
| `is_active` | boolean default `true` | Deactivate leavers without deleting history |
| `created_at` | timestamptz | |

**Read access is wide open** — `profiles_select_all` grants `SELECT` on this entire table to any authenticated user, `USING (true)`, no scoping at all. Unlike every warehouse-scoped table (§2.3), knowing someone's name/email/admin status isn't treated as sensitive per-warehouse information — every signed-in user can look up every other signed-in user's profile row, active or not.

The admin still enters one email + one role on the User Management screen — that value lands in `default_role`. The **authoritative** role is per warehouse, in `warehouse_members`.

### 3.2 `invitations`
Backs the admin User Management screen and gates sign-in (password only — see §5.1, the plan's original "Sign in with Google" option was never built).

| Column | Type |
|---|---|
| `id` | uuid PK |
| `email` | text unique |
| `default_role` | enum, nullable |
| `grant_dashboard_admin` | boolean default false — **as built**, not in the original plan |
| `warehouse_ids` | uuid[] default `'{}'` — **as built**, not in the original plan. Migration `warehouse_code_redesign_and_multi_warehouse_invite` (11 Aug 2026) widened this from a single nullable `warehouse_id` to an array, alongside the warehouse-creation redesign in the same migration (§5.4/§5.5) — one invitation can tag someone onto several warehouses at once |
| `invited_by` | uuid FK → profiles |
| `created_at` / `accepted_at` | timestamptz |

**`grant_dashboard_admin` is a build-time addition.** The original plan had no way to create a second admin: `is_dashboard_admin` lived only on `profiles`, and nothing wrote to it after the bootstrap seed. Ticking this box on the invitation makes the person an admin the moment they first sign in. `set_dashboard_admin()` covers the after-the-fact case (currently unused in the UI — no screen edits an existing member's access, see §14.3).

**As built (12 Aug 2026), the invite form's Role picker and the admin flag were merged into one control.** `default_role` is now nullable — "Dashboard Admin" sits in the same dropdown as the 6 operational roles (`lib/roles.ts`'s `INVITE_ROLE_OPTIONS`), mutually exclusive with them: picking it sets `grant_dashboard_admin = true` and `default_role = null`, skips the warehouse picker entirely (admin's powers are global, not warehouse-scoped — §2.2), and vice versa. The People table's old separate "Admin" column is gone; an admin's status now shows inline in the Role column instead ("Dashboard Admin, PMO" for someone who is both — `is_dashboard_admin` and real per-warehouse roles are independent facts and both are shown, even though the invite form itself no longer lets you create that combination going forward).

**`warehouse_id` is a build-time addition, added for the same reason.** Onboarding originally required two trips — invite the person here with a role, then separately go to Manage warehouse (§5.5) to tag them onto one. Picking a warehouse alongside the role at invite time does both in one step: `handle_new_user()` inserts the matching `warehouse_members` row (using this warehouse and the invitation's `default_role`) right after it creates the profile. Leaving the warehouse unset is still valid — an admin-only invitation, or someone who'll be tagged onto a warehouse later via Manage warehouse, needs no warehouse here.

Admin enters **email + role** (+ optionally warehouse), one-to-one. On first sign-in — by **either** method — a trigger matches `auth.users.email` against this table and creates the `profiles` row. **No matching invitation → access denied.**

### 3.3 `warehouses`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text unique | |
| `go_live_date` | date **nullable** | Set by resolvers from the warehouse screen, not at creation |
| `snag_counter` | int default 0 | Backs per-warehouse serial numbers |
| `site_location` | text nullable | **As built** — the column and the `create_warehouse` RPC parameter still exist, but no path in the current UI sets it (§5.4/5.5's create form never had a field for it after the redesign — not "dropped after feedback" as originally noted, it simply wasn't part of the replacement form) |
| `created_by` | uuid FK → profiles | |
| `created_at` | timestamptz | |
| `is_active` | boolean default `true` — **as built**, not in the original plan | Toggled by §5.5's Activate/Deactivate. Filters the sidebar and landing grid (both query `eq("is_active", true)` client-side) but is **not** checked by any RLS policy — `warehouses_select_scoped` has no `is_active` condition, so a deactivated warehouse's detail page, snags, and history all stay fully reachable by direct URL for anyone already tagged to it or a Dashboard Admin. `warehouse_readiness` (§ below) also doesn't filter on it — the view returns every warehouse regardless of active status, so any query against it needs to intersect with an explicit `is_active` fetch, the way both the sidebar and landing page do |

The six tagged people are **not** columns here — they live in `warehouse_members`, which avoids six near-identical FK columns and lets the header block be rendered from one query.

### 3.4 `warehouse_members`
Single source of truth for both tagging and the detail-screen header.

| Column | Type |
|---|---|
| `id` | uuid PK |
| `warehouse_id` | uuid FK |
| `user_id` | uuid FK → profiles |
| `role` | enum: `operations`, `hvac_engineer`, `program_manager_infra`, `pmc`, `pmo`, `warehouse_admin` |
| `created_at` | timestamptz |

`UNIQUE (warehouse_id, user_id, role)` — **many people may hold the same role** in one warehouse. Three HVAC engineers and two PMCs on a single warehouse is fine. The previous one-person-per-role constraint is removed.

**`operations` is newly added** per your request.

**This table is the authority on permissions, and now on read access too (§2.3).** Every write check reads it: "does `auth.uid()` hold a reporter role in this warehouse?" A user with no row here for a given warehouse cannot read it or write to it — Dashboard Admins are the one exception, and only for reads (§2.2).

Rows are populated two ways, **neither of which is Manage warehouse (§5.4/5.5) — that screen has no member-tagging UI at all**: automatically, when someone with an invitation carrying `warehouse_ids` (§3.2) signs in for the first time; or directly via the "+ Add warehouse" control on the People screen (§5.6) for someone already signed in. There is no UI path to remove a row from this table (delete it) — only to add to it or overwrite `role` for warehouses already held.

### 3.4a `warehouse_activity` — **undocumented table, not in the original plan**

Append-only audit log for **warehouse-level** administrative actions, structurally identical to `snag_activity` (§3.13) but scoped to `warehouses` rather than `snags`. Added in the same migration that redesigned warehouse creation (`warehouse_activity_grants`, 11 Aug 2026), backing the "status history" expand-row on the Manage warehouse screen (§5.4/5.5).

| Column | Type |
|---|---|
| `id` | uuid PK |
| `warehouse_id` | uuid FK |
| `actor_id` | uuid FK → profiles, nullable |
| `action` | text — currently `create`, `activate`, `deactivate` |
| `field` / `old_value` / `new_value` | text, nullable — only populated for `activate`/`deactivate` (`field = "is_active"`); `create` rows leave all three null |
| `created_at` | timestamptz |

Both RLS policies (`SELECT`, `INSERT`) are `private.is_dashboard_admin()` only — nobody else can read or write this table, matching the fact that only admins can reach the screen that shows it.

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

**Derived, not stored** — computed in the `snags_with_derived` view (`security_invoker = true`, per §2.3's rule on views over RLS-protected tables) so they're never stale. Not currently queried anywhere in the frontend — every screen that needs ageing/overdue computes it client-side instead, in `lib/snags.ts`'s `ageingDays()`/`isOverdue()`, from the same two source columns. The view exists as the schema's own record of the derivation and is the one to extend if a future screen needs it server-side (e.g. sorting/filtering by ageing at the database level):
- `ageing_days` = `coalesce(closed_at::date, current_date) − date_raised`
- `is_overdue` = `etc_date is not null AND etc_date < current_date AND status <> 'closed'`

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
Frozen chamber · Ante room · ODU area · WH ambient area

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
| `author_side` | enum `reporter`, `resolver`, `admin` — **as built**, not in the original plan |
| `created_at` | timestamptz |

In the table view the Update cell shows the **latest** entry plus a count ("3 updates"); expanding the row reveals the full chronological log. Updates are **append-only** — an edit would destroy the audit trail.

**`author_side` is a build-time addition (14 Aug 2026)**, added when the update log became a two-sided chat thread (§5.7.1). It records which side of the conversation the message was posted on — **snapshotted at post time**, not derived from the author's current `warehouse_members` role, so a message's side stays correct even if that person's role tag later changes or is removed. Originally only resolvers could write to this table at all (`post_snag_update` was resolver-only); it's now open to reporters too, distinguished by this column. `admin` covers a Dashboard Admin bypassing without holding the real tag for whichever side they posted as — see `dashboard_admin_snag_bypass` and `post_snag_update_open_to_reporters` in the migration history for the exact rule.

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
Append-only audit log: actor, action, field, old value, new value, timestamp. Every RPC that changes a snag writes here — raise, status change, ETC update, verify/reject closure, direct close, duplicate-suppressed, date correction.

**As built** — this table existed from Phase 0 but had no viewer until a later round, and went through two different presentations since. It first gained a "View history" toggle rendering these rows as plain-English lines. That toggle is now gone (§5.7.1) — its rows merge directly into the chat feed instead, interleaved by timestamp with the `snag_updates` messages as small centered system lines with no avatar or bubble. See `describeActivity()` in `snag-row.tsx` for the action → sentence mapping.

### 3.9.1 `snag_action_result` — **new composite type**
`close_snag_directly` and `verify_snag_closure` both return this instead of a bare `snags` row, once they gained the ability to carry an optional comment (§5.7.1):

| Field | Type |
|---|---|
| `snag` | `snags` |
| `update_id` | uuid, nullable |

`update_id` is set only when a non-empty comment was supplied — the caller uses it the same two-step way `raise_snag`/`post_snag_update` already work: the RPC creates the row, then the client uploads any attached photo/video to that id separately.

---

## 4. Column-level permissions

Reporters and resolvers write different columns of the same row, and Postgres RLS is row-level only. All writes therefore go through `SECURITY DEFINER` RPC functions in `public` (all with `SET search_path TO ''`, so every reference inside them is schema-qualified), each accepting only its role's fields and checking `auth.uid()` membership internally. Exact signatures, as built:

- `raise_snag(p_warehouse_id uuid, p_description text, p_category snag_category, p_sub_category snag_sub_category, p_location snag_location, p_scope snag_scope, p_severity snag_severity, p_sub_category_other text, p_id uuid, p_suppressed_duplicate_ids uuid[]) returns snags` — any reporter tagged to the warehouse, or Dashboard Admin; allocates serial number, stamps `date_raised` and `raised_by`, records suppressed duplicate ids. `p_id` lets the caller supply the row's own uuid — the offline-raise path (§5.8) generates it client-side so a locally-queued snag has a stable identity before it's ever synced
- `post_snag_update(p_snag_id uuid, p_body text, p_etc_date date, p_status snag_status, p_acting_as text) returns snag_updates` — **as built (14 Aug 2026)**: open to both reporters and resolvers, not resolver-only as originally planned — `p_acting_as` (`'reporter'` or `'resolver'`) states which hat the caller is posting under, verified server-side against their real membership (or Dashboard Admin bypass), never trusted from the client. `p_etc_date`/`p_status` are rejected outright unless `p_acting_as = 'resolver'`; `p_status` may only move to `wip` or `ready_to_close` (§5.7.1)
- `verify_snag_closure(p_snag_id uuid, p_approved boolean, p_body text) returns snag_action_result` — any tagged reporter, or Dashboard Admin; requires `ready_to_close`. `p_body` is optional (**as built**, 14 Aug 2026) — if supplied and non-empty, posts as a real chat message on the reporter's side alongside the status change instead of just a system line
- `close_snag_directly(p_snag_id uuid, p_body text) returns snag_action_result` — **as built**; any tagged reporter, or Dashboard Admin, from any status (§3.9). Same optional `p_body` treatment as `verify_snag_closure`
- `set_go_live_date(p_warehouse_id uuid, p_date date) returns warehouses` — any resolver tagged to the warehouse, or Dashboard Admin
- `correct_date_raised(p_snag_id uuid, p_new_date date) returns snags` — **Dashboard Admin only**, no bypass-of-a-tag needed since this power was never tag-gated to begin with; writes to `snag_activity`
- `find_similar_snags(p_warehouse_id uuid, p_location snag_location, p_sub_category snag_sub_category, p_description text, p_threshold real default 0.3) returns table(id uuid, serial_no integer, description text, status snag_status, raised_by_name text, similarity real)` — duplicate detection (§7); `extensions.similarity()` from `pg_trgm`, ranked descending, `limit 10`, callable by anyone who can read the warehouse (no reporter/resolver gate — checking for duplicates isn't a write)
- `create_warehouse(p_name text, p_site_location text, p_members jsonb) returns warehouses` — admin; warehouse + member rows (from a `{user_id, role}[]` JSON array) in one transaction. **Still deployed, no longer called by anything in the frontend** — see §5.4/5.5's dead-code note; the live create path is `createWarehouseCode`, a plain insert, not this RPC
- `set_user_active(p_user_id uuid, p_is_active boolean) returns profiles` · `set_dashboard_admin(p_user_id uuid, p_is_admin boolean) returns profiles` — admin. `set_dashboard_admin` has no caller in the current frontend either (admin status can only be *granted* today, at invite time via `invitations.grant_dashboard_admin` — §3.2 — never toggled after signup; see the CLAUDE.md gotcha on editing existing members)
- `refresh_snag_daily_snapshot() returns void` — no permission check of its own; not exposed to `authenticated`/`anon` (see §12.1's grant note), called only by the `pg_cron` job

Dashboard Admin bypasses the reporter/resolver tag check (`private.is_dashboard_admin()` OR'd into the check) on every one of the above **except** `correct_date_raised`, which was already admin-only before the bypass existed and needs no OR, and `find_similar_snags`/`refresh_snag_daily_snapshot`, which aren't tag-gated in the first place (§2.2).

Two non-RPC `SECURITY DEFINER` functions complete the picture: `handle_new_user()` (no args, `returns trigger`, fires `AFTER INSERT ON auth.users` as `on_auth_user_created` — §3.2/§5.1) and `set_updated_at()` (no args, `returns trigger`, `SECURITY INVOKER` not DEFINER, fires `BEFORE UPDATE ON snags` as `snags_set_updated_at` — the generic "stamp `updated_at = now()`" trigger, not itself a permission boundary).

### 4.1 As built — the rule applies to snags, not to everything

The "never a raw `UPDATE`" rule turned out to be the right constraint for **snag data** and the wrong one for **administration**. What actually shipped is a deliberate split:

| Tables | Write path | Enforced by |
|---|---|---|
| `snags`, `snag_updates` | **RPC only** | No `UPDATE` or `DELETE` policy exists at all — direct writes are impossible, not merely discouraged |
| `warehouses`, `warehouse_members`, `invitations`, `warehouse_activity` | Direct table access | Admin-only RLS policies on insert / update / delete (`warehouse_activity`: insert + select only, no update/delete policy at all — it's append-only by omission, not by an explicit block) |
| `attachments` | Direct insert | Member-scoped insert policy (reporter or resolver on that snag's warehouse, or Dashboard Admin); select scoped to warehouse membership |

The reasoning: the RPCs exist to stop one role overwriting another role's columns on a shared row. Warehouse and user administration has no such problem — it is admin-only end to end, so a policy expresses the rule more simply than a function would.

Worth knowing when reading the code: warehouse creation and activate/deactivate are plain PostgREST calls in `warehouses/manage/actions.ts` (`createWarehouseCode`, `setWarehouseActive`), not RPCs — despite `create_warehouse` existing as an RPC (above), it isn't the one actually called. There is currently no rename or member add/remove capability anywhere, RPC or direct, reachable from the UI (§5.4/5.5).

Keep these in a non-exposed schema with explicit `auth.uid()` checks in the body.

---

## 5. Screens

### 5.1 Login — **as built, password-only**

The original plan specified Google sign-in as primary with password as a fallback for contractors without a Google account. **Google sign-in was built, then tried live and reverted** — password is the only auth method in the app today. Two distinct pages cover the two cases, both gated by `invitations`:

- **`/set-password`** (first-time signup) — full name + email + password + confirm password → `supabase.auth.signUp()`. This fires `handle_new_user()` (§3.2, §4), the trigger that checks `invitations` for a matching email and creates the `profiles` row — **no matching invitation → the signup itself fails**, surfaced by `setPassword()` (`app/set-password/actions.ts`) as an inferred `not_invited` error (Supabase doesn't return a distinct error code for a trigger exception, so the action rules out weak-password and already-exists first, then assumes not-invited by elimination).
- **`/login`** (returning users) — email + password → `signInWithPassword()`. Failure redirects to `/login?error=invalid_credentials`.
- **`/forgot-password`** → `/auth/update-password`, via `/auth/confirm` (a `route.ts` handler that calls `verifyOtp()` on the emailed token, then redirects). Always shows the same "check your email" message regardless of whether the address exists — Supabase never reveals that. **Known gap:** the Supabase-side "Reset Password" email template still uses the default `{{ .ConfirmationURL }}` rather than being repointed at `/auth/confirm`, so the emailed link doesn't actually work yet — a one-time dashboard edit outside this codebase's reach (see the CLAUDE.md gotcha for the exact template string needed).
- Session state: `@supabase/ssr` cookies, refreshed on every request by `src/proxy.ts` (Next.js 16 renamed middleware to "proxy" — `AGENTS.md`) calling `updateSession()` (`lib/supabase/proxy.ts`), which gates every route except `/login`, `/auth/*`, `/forgot-password`, `/set-password` by requiring `getClaims()` to return a user — redirecting to `/login` otherwise. `getClaims()`, not `getSession()`, is deliberate: it's the call that actually verifies the JWT signature server-side.

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

### 5.4 – 5.5 Warehouse management (Admin only) — **rebuilt (11 Aug 2026), the plan below no longer describes what's built**

The original plan (preserved as a footnote at the end of this section) specified a rich "Add Warehouse" onboarding form — name + site location + six searchable multi-select role pickers, tagging the whole team at creation — plus a separate "Manage warehouse" screen for rename / add-remove members / two-step-confirm delete. **None of that shipped as described.** Migration `warehouse_code_redesign_and_multi_warehouse_invite` (11 Aug 2026) replaced it with something much simpler, and the plan text was never reconciled against the change until this pass (18 Aug 2026). What's actually live, at `/warehouses/manage` (`warehouse-code-manager.tsx`):

- **Create** — one field, a free-text "warehouse code" (stored in `warehouses.name`; despite the label there's no distinct code/name split, no uniqueness check client-side beyond the DB's `name unique` constraint, no `site_location` field at all). No member tagging happens here — a new warehouse starts with zero rows in `warehouse_members`. People are tagged onto it afterwards, either by inviting them with that warehouse in `invitations.warehouse_ids` (§3.2, §5.6) or via the "+ Add warehouse" control on an existing member (§5.6).
- **Activate / Deactivate** — toggles `warehouses.is_active` (§3.3). A deactivated warehouse disappears from the sidebar and landing grid for everyone (both queries filter `is_active = true` — `app-shell.tsx`'s layout query and `page.tsx`'s landing query) but its detail page, snags and history are all still directly reachable by URL for anyone who was already tagged to it or is a Dashboard Admin — deactivating does not touch RLS, only visibility in these two listings.
- **Status history** — clicking a row expands an inline log of every `create`/`activate`/`deactivate` event on that warehouse, from `warehouse_activity` (§3.4a), each line "`{time} · {actor} {action}`".
- **No rename, no delete, no member management** anywhere in this UI. `StatusFilter` (`status-filter.tsx`) lets the admin filter the list to All / Active / Deactivated.

**What still exists in the database but is unreachable from the UI** — worth knowing if you're extending this screen, since a rebuild that only reads the frontend would miss all three:
- The `create_warehouse(name, site_location, members jsonb)` RPC from the original plan is still deployed, unchanged, and still fully functional (admin-only, inserts the warehouse and every member row in one transaction) — nothing in the current frontend calls it. `createWarehouseCode` (`manage/actions.ts`) does a plain two-column insert instead.
- `components/role-people-picker.tsx` (the searchable multi-select role picker described below) is not imported by anything — dead code left over from the original onboarding form.
- The `warehouses_delete_admin` RLS policy (`DELETE`, admin-only) is still live in Postgres — see the ⚠️ below. There is no UI path to it, but it is one authenticated PostgREST/SQL call away for any Dashboard Admin.

#### ⚠️ Warehouse deletion is still possible at the database layer, and is destructive and irreversible

`snags.warehouse_id` carries `ON DELETE CASCADE`, and every snag child table cascades in turn. Deleting one warehouse would silently destroy:

```
warehouses
 └── snags                → snag_updates      → attachments
                          → snag_activity     (the audit trail)
                          → attachments
 └── warehouse_members
 └── warehouse_activity   (this warehouse's own status-history log)
 └── snag_daily_snapshot  (all burn-up history)
```

There is no soft delete and no archive. The only thing standing between a delete and permanent loss is that no button in the current UI issues one — the underlying capability (RLS policy + cascade) was never removed when the button was. **The audit trail goes with it** — precisely the record you would want if a deletion were ever disputed.

This sits awkwardly against the deliberate "deactivate, never delete" rule for users in §5.6, where preserving history was the stated reason. The same argument applies at least as strongly to a warehouse carrying months of snags — deactivation, not deletion, is the only offered path today, which is consistent with that reasoning even though it wasn't stated as the rationale at the time.

<details>
<summary>Original plan text for this section (superseded — kept for historical reference only, do not build against it)</summary>

**Add Warehouse (Admin only).** Name + site location + six **searchable multi-select** pickers: Operations, HVAC Engineer, Program Manager (Infra), PMC, PMO, Warehouse Admin. Each accepts **any number of people** — three HVAC engineers on one warehouse is normal. Selected people render as role-coloured chips. Each picker lists all active users, sorted so that people whose `default_role` matches the slot appear first — a hint, not a restriction. Each has an inline "invite" escape hatch. No go-live date field — resolvers set it later. **"Add me" affordance:** because Dashboard Admin grants no operational rights, the form needs a one-click way for the admin to tag themselves into a role on the warehouse they're creating.

**Manage warehouse.** Rename (plain update on `warehouses.name`), add/remove members (insert/delete on `warehouse_members`), and a two-step-confirm delete.

</details>

### 5.4a `components/role-people-picker.tsx` — dead code, documented for completeness

Since a rebuild working only from a component inventory might otherwise wire this back in and assume it's load-bearing: this is the searchable multi-select "pick people for a role" control the original onboarding form (above) would have used. It renders, has no compile errors, and isn't broken — it's simply not imported anywhere in the current app. Leave it alone unless the onboarding-at-creation flow is deliberately being rebuilt.

### 5.6 User Management (Admin only)
Table of invitations: email, default role, **warehouse** (§3.2), status (invited / active / deactivated), and Dashboard Admin status. Add a row = email + role + optional warehouse, one-to-one.

**As built:**
- **Warehouse column** shows the pending assignment (`"{name} (pending)"`) for invited-not-yet-signed-up rows, and the real, possibly-multiple current `warehouse_members` list for active ones — not the stale invitation value, since Manage warehouse can change membership after signup
- **Make/Revoke admin** is a button beside the person's email, not a separate action column — toggles `is_dashboard_admin` directly for anyone with a profile (i.e. anyone past `status = invited`)
- Deactivate rather than delete, to preserve snag history

**As built (17 Aug 2026) — a "+ Add warehouse" control per row** (`add-warehouse-control.tsx`) fills part of the gap noted in `CLAUDE.md`: `handle_new_user()` only provisions `warehouse_members` on first sign-in, so re-inviting someone already active has no effect (§3.2's `createInvitation` refuses this outright). The control lets an admin pick one or more warehouses — "All" selects every currently active one, mirroring the invite form's own picker — and writes `warehouse_members` rows directly, the same admin-tables-use-plain-RLS convention as everything else in this section. Shown only for accepted, non-admin profiles (Dashboard Admin already reads/writes everywhere without a tag, and a pending invitation has no `user_id` yet to attach rows to).

**Revised (17 Aug 2026) — no role picker; one role per person, not per warehouse.** The first version let the admin choose a role per call, which meant re-running it on someone already tagged elsewhere with a different role left them holding two roles at once — discovered on a real test account with different roles stacked across four warehouses. `addWarehouseMembership` now takes no role argument: it reads `profiles.default_role` (set once at invite time) as the person's single role, and on every call rewrites *all* of their `warehouse_members` rows — existing warehouses plus newly-picked ones — under it, self-healing any prior drift rather than only preventing new drift. See §2.1's narrowing note. There's still no way to remove a warehouse tag outright (with no replacement) or change `is_dashboard_admin` for someone already signed in from this screen.

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
- **Sort — as built (18 Aug 2026).** A small icon beside every header (`snag-table.tsx`) cycles ascending → descending → back to the table's normal order (`serial_no` descending, as fetched) on each click; only one column sorts at a time. Client-side over the already-fetched page of snags, not a server round trip. Severity and Status sort by their real lifecycle/severity rank (`SEVERITY_LABELS`/`STATUS_LABELS`' key order, high→low and open→closed) rather than alphabetically; Update sorts by the latest message's timestamp, not its text; rows with no value for a column (no ETC, no updates yet) always sort last regardless of direction.
- `Add Snag` / `Add Update` shown only if you are tagged here
- Expanding a row shows the update thread (§5.7.1)

### 5.7.1 Update thread — **rebuilt as a two-sided chat (14 Aug 2026)**

The expanded row was originally a single dot-and-line-connected timeline (resolver updates only, reporters had no way to comment) plus a separate collapsed "View history" toggle for the `snag_activity` audit log. Both are gone, replaced by one merged, chronological feed:

- The raise (description + any raise-time photos) is the thread's opening message, always on the reporter's side.
- Every `snag_updates` message renders as a bubble on the **left** (reporter), **right** (resolver), or **centered/neutral** (Dashboard Admin bypassing without a real tag) — governed by that row's `author_side` (§3.11), snapshotted at post time.
- Every `snag_activity` row except `raise` (already represented by the opening message) interleaves by timestamp as a small centered muted system line, no bubble — including the duplicate-match note and admin date-corrections, which don't have a natural conversational partner but still belong in the sequence.
- Below the feed, one role-aware compose box (`components/snag-compose.tsx`):
  - **Reporter-only**: comment + photo + video, plus "Close ticket" (any status except `closed`/`ready_to_close`) or "Confirm closed" / "Reject — reopen" (when `ready_to_close`) — each with the same optional comment+media, matching the RPC's optional `body` (§3.9.1).
  - **Resolver-only**: comment + photo + video + ETC date + status dropdown, unchanged in spirit from the original resolver-only update form.
  - **Both roles genuinely tagged on this warehouse**: one box with a "Commenting as Reporter / Resolver" toggle that swaps which extra controls show and which side the message lands on — the caller states which hat they're using, but the RPC verifies it against real membership before honoring it.
  - **Dashboard Admin with no tag on this warehouse**: every control shown at once (no toggle needed, since bypass already grants both capacities) — comment, photo, video, ETC, status, and the close/verify buttons all together.
- Photo capture (with the circle-the-defect annotation tool) and video capture are both available on every compose box now — video was previously resolver-only, photo was previously raise-time-only.

No real-time push: the other party sees a new message on their own next action or page load, matching the rest of the app (§14.2).

**Revised again (17 Aug 2026)**, after live feedback on the first version:

- **The panel stays put while the table is scrolled horizontally.** It's nested inside a colSpan cell (which can't itself be sticky — a real `position:sticky` limitation on table cells spanning the full row width), but a plain block *inside* that wide cell can be, sticking to the left edge of the table's own scroll container.
- **A closed snag has no compose box at all** — not just the close/verify buttons hidden, the entire comment/photo/video section. There's nothing left to do once a snag is closed.
- **Every message and system line now leads with time, then date, then the person** — `14:57 · 12 Aug · Vaibhav Sharma`, reading like a log entry — instead of the name-first layout the first version shipped with.
- **The message body sits in a tinted box matching its side** — the reporter's warm blush, the resolver's cool frost, admin's neutral line-soft — not a plain white box with just a colored name badge.
- **The badge shows the author's actual operational role** (e.g. "HVAC Engineer", "PMO") when they're currently tagged with one on this warehouse, looked up fresh at render time — not the generic Reporter/Resolver/Dashboard Admin bucket.
- **Photo and video sit side by side** in the compose box, not stacked, on screens wide enough for it (stacks again below `sm` — this section isn't part of the mobile-first raise flow in §5.8, but the compose box still renders on a phone-width browser if someone opens it there).

**Revised a third time (17 Aug 2026)**, after a further round of live feedback on the panel's sizing, visual weight, and badge accuracy:

- **Panel width is measured, not capped.** The earlier `w-[min(1000px,90vw)]` guess is gone — a `ResizeObserver` on the table's own scroll container (`[data-slot="table-container"]`) reads its live `clientWidth` and the panel matches it exactly, so it always fills the actually-visible screen area regardless of sidebar state or viewport size, and stays in sync across resizes rather than being set once.
- **The panel now reads as a distinct screen, not more table.** It sits on `bg-background` (the page's warm `--ground` tone) inside a bordered block with its own padding and a small "SNAG #N — UPDATES" micro-label header, instead of sharing the table body's plain white `bg-card` — the two were visually indistinguishable before this pass.
- **The badge's real-role-first rule got one more tier.** A message from someone with no current tag on this warehouse but real Dashboard Admin status now shows "Dashboard Admin" — not the generic bucket label. This mattered most for the raise bubble, which always sits on the reporter side for positioning regardless of who raised it; an admin bypassing to raise a snag was showing "Reporter" on their own message, which isn't true of them. Priority is now: real tagged role(s) on this warehouse > "Dashboard Admin" (untagged admin) > the generic side bucket, the last-resort case for someone with neither (e.g. removed from the org, message kept for the record). See `roleTextFor()` in `snag-row.tsx`.
- **Photo and video pickers accept more than one file each (17 Aug 2026).** `MultiPhotoCaptureInput`/`MultiVideoCaptureInput` (`components/photo-capture.tsx`, `components/video-capture.tsx`) wrap the original single-item editors: each captured item is a "draft" the picker resets to its empty state after an explicit "+ Add this photo/video" tap, appending it to a list of thumbnail chips rather than replacing the one slot the original components managed. `attachDraftMedia` uploads the whole list sequentially (`snag-photo-1.jpg`, `snag-photo-2.jpg`, …) against the same `updateId`, since `attachments` was already a proper join table with no per-snag/per-update row limit — no schema change needed. The Add Snag form's photo field (§5.8) got the same treatment; its offline-queue path (`lib/offline-queue.ts`'s `QueuedSnag.photos`) and sync (`lib/sync-queue.ts`) were updated to carry an array instead of three single-blob fields. Testing this surfaced (and fixed, same day) a pre-existing gap: `postSnagUpdate`'s `revalidatePath` runs before `attachDraftMedia` even starts its client-side upload, so the text bubble appeared immediately but its attachments didn't — not even for the sender — until some later, unrelated refresh. `SnagComposeArea`'s `afterAction` now calls `router.refresh()` once the upload resolves.

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

**As built:** `find_similar_snags(p_warehouse_id, p_location, p_sub_category, p_description, p_threshold real DEFAULT 0.3)`, called from `snags/new/actions.ts`'s `findSimilarSnags()` without passing `p_threshold` — always the RPC's own default. Ranks by `extensions.similarity()` against `description`, capped at `limit 10` candidates. See §4 for the full signature.

---

## 8. Excel import / export

- **Export** — current filtered view to `.xlsx`, all columns plus ageing and overdue flag
- **Import** — download a sample template first, with the exact headers, the valid enum values per column, and one example row. Upload is validated row-by-row with errors reported per line before anything is committed.

---

## 9. Build phases

| Phase | Scope |
|---|---|
| **0** | Schema, enums, RLS, RPC functions, `pg_trgm`, **`snag_daily_snapshot` + `pg_cron` job**, seed first admin |
| **1** | Google + password auth *(as planned; Google was later reverted — password only, §5.1)*, invitation gate, profiles, User Management |
| **2** | Warehouse CRUD with multi-select pickers *(as planned; the shipped create flow is code-only, §5.4–5.5)*, sidebar, landing cards + readiness gate |
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
| Login | **Password only** (§5.1) — gated by the invitation list. Google sign-in was built, tried live, then reverted |
| Sub-category | **No filtering** — all eleven always available under both categories |
| Media storage | **Supabase Storage**, private buckets, signed URLs, client-side compression |
| Serial number | Auto, per warehouse, atomic counter |
| Status | Resolvers drive to `ready_to_close`; **any tagged reporter** verifies closure — or closes directly from any status (§3.9) |
| Visibility | Scoped to warehouse membership; Dashboard Admin reads everything (§2.3) |
| Dashboard Admin scope | User management + create/deactivate warehouse (no rename or delete in the UI, §5.4–5.5) + correct `date_raised` + read everywhere + bypass reporter/resolver on every snag-adjacent write (§2.2). Must self-tag for any write the bypass doesn't cover |
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

A daily snapshot per warehouse, written by a `pg_cron` job (jobname `snag-daily-snapshot`, schedule `5 0 * * *` — 00:05 UTC daily, `select public.refresh_snag_daily_snapshot();`). The function has no `authenticated`/`anon` grant — only `postgres`/`service_role` can call it, so it's unreachable from the app itself even in principle; the cron job is the only caller.

| Column | Purpose |
|---|---|
| `warehouse_id` · `snapshot_date` | Composite key |
| `total_raised` | Cumulative — the scope line |
| `total_closed` | Cumulative — the progress line |
| `open_count` | `total_raised − total_closed`; the shaded gap |
| `open_high_count` | Also feeds the launch-readiness gate on the landing cards |

The chart derives entirely from this table, which keeps it a cheap indexed read rather than an aggregation over `snags`.

**`total_raised`/`total_closed` are recomputed from live `snags` counts on each run, not a true ever-incrementing ledger** — so a snag deleted directly at the database layer (no UI path does this, but nothing blocks it) would show up as both totals dropping on that day's snapshot, which the chart's two-cumulative-lines premise can't represent sensibly. **As built (18 Aug 2026):** `BurnUpChart` clamps each day's displayed totals to never fall below the prior day's, purely at render time — a rendering-layer guard against exactly this, not a fix to the snapshot function itself.

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

All ten phases shipped, then many further rounds of live feedback and fixes. Migration count keeps climbing — `mcp__supabase__list_migrations` (or `supabase migration list` against a pulled-down copy) is the source of truth; this document does not try to enumerate them or keep a running count.

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
| `snag_activity` gained a viewer ("View history"), later folded into the chat feed and the toggle removed | §3.13, §5.7.1 |
| Dashboard Admin gained a fourth power: bypass reporter/resolver on all snag RPCs | §2.2 |
| Update thread rebuilt from a resolver-only dot timeline into a two-sided reporter/resolver chat | §5.7.1 |
| Google sign-in was built, then reverted — password is the only auth method | §5.1 |
| Warehouse onboarding rebuilt from a rich multi-role form into a code-only create; rename/delete/member-management dropped from the UI (though `create_warehouse`, the delete RLS policy, and `role-people-picker.tsx` all still exist unreachably) | §5.4 – 5.5, §5.4a |
| `warehouse_admin` moved from the resolver group to the reporter group | §2.1 |
| `warehouse_activity` — an audit-log table for warehouse create/activate/deactivate, structurally parallel to `snag_activity` but never in the original plan | §3.4a |
| `profiles` gained a fully-open, unscoped `SELECT` policy (`profiles_select_all`) — anyone authenticated can read any profile, unlike every other table's per-warehouse scoping | §3.1 |

**Dead code, deployed but unreachable from the UI** — not a divergence in behaviour, but worth knowing before assuming any of these are load-bearing: the `create_warehouse` RPC (§5.4 – 5.5), `components/role-people-picker.tsx` (§5.4a), and the `warehouses_delete_admin` RLS policy (§5.4 – 5.5 ⚠️).

### 14.2 UI behaviour added after the plan was written

None of this changes the data model (except where noted in §14.1); it came out of live testing and is recorded so it is not mistaken for undocumented drift.

- **Sticky columns** — S.No, Date and Description pin to the left edge while the remaining columns scroll under them. Fixed pixel widths (60 / 70 / 290 = 420px); see `lib/table-sticky.ts` for why percentages could not be used. A row's own expanded content can't be pinned the same way directly — `position: sticky` does not work on a cell spanning the full row width, a real browser limitation rather than a bug in this codebase — so the chat panel nests a plain `<div>` inside that wide cell instead, which *can* be sticky; see §5.7.1 for the current behaviour (this replaced an earlier version that reset the table's horizontal scroll on expand instead).
- **Collapsible sidebar** — collapses to an icon rail, content fully hidden rather than clipped, with a Home button (shown only while the rail is open) and sticky pin behaviour so it and the top header stay in place while the page scrolls.
- **Team block** — expands **inline**, pushing the rest of the header down, with a close button in the top-right of the expanded box. (An earlier round tried an overlay that floated over the page instead; reverted back to inline on feedback — see the "changed twice" pattern in §2.3.)
- **"Timeline" → chat thread** — the update log was originally a bulleted, dot-and-line-connected list (resolver-only, with a raise-time photo tagged "Description" getting its own dot). Rebuilt 14 Aug 2026 into the two-sided chat described in §5.7.1; the dot-timeline presentation and the "Description" tag are both gone.
- **Filters are multi-select**, not single-value — every snag-table filter (status, category, sub-category, location, scope, severity) accepts more than one value at once.
- **Multi-select filters, search box, Export/Import/Add-snag** all share a single row rather than stacking on separate lines.
- **Snag-raised confirmation** — a banner appears after raising a snag and dismisses itself after 5 seconds with an animated exit rather than disappearing instantly.
- Dashboard card split (all-warehouses totals vs. next-to-launch), hover-pop on cards, standardised laptop-viewport padding (50px), description tag in the table, Add Snag form starts with no field pre-selected.

### 14.3 Known gaps

- **Migrations are not in version control.** They exist only in the Supabase project. `npx supabase db pull` writes them to `supabase/migrations/` — do this before any environment move.
- **No soft delete for warehouses** (§5.5).
- **Category and scope are deferred on mobile**, so they are nullable for mobile-raised snags. The "finish this snag" prompt back at a desk was never built.
- **Notifications** were never started — overdue ETC is visible in the UI but nothing reaches the person who can act on it. The chat thread (§5.7.1) has the same gap: no live push, so a new message from the other side is only seen on your own next action or reload, not in real time.
- **Password-reset email deliverability depends on a one-time Supabase dashboard step.** The "Reset Password" email template still needs its link changed to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/update-password`, since the default template points at Supabase's hosted verify page, which can't set a session cookie on this app's own domain. Supabase's built-in email sending is also heavily rate-limited — fine for testing, not for production volume.
- **"Deactivate" in User Management does not currently revoke access — found 18 Aug 2026, not yet applied.** `set_user_active()` writes `profiles.is_active`, but nothing reads it: not `private.is_dashboard_admin()`, not `private.is_warehouse_member()`, not `private.has_warehouse_role()` (which `is_reporter`/`is_resolver` both call), no RLS policy anywhere, no auth/proxy gate. Confirmed by searching every function body and every policy in the schema for `is_active` — `set_user_active` is the only hit. A deactivated person can still sign in and use every capability they had before; only the status badge changes. A fix was drafted — gate those three primitive functions on `is_active` (they're what every RLS policy and RPC route through, so this cascades everywhere at once) and add a self-deactivation guard to `set_user_active` (there's exactly one active Dashboard Admin today; without the guard they could lock themselves out with no one left to undo it) — but applying it was declined for this pass. The SQL is in this session's transcript if picked back up later.
