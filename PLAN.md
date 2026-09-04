# Frozen Warehouse Launch Readiness

**Domain:** Frozen / cold-storage warehouse launches
**Status:** **Built.** All ten phases shipped — see §14 for what landed and where the build diverged from this plan.
**Stack (as built):** Next.js App Router + TypeScript + Tailwind + shadcn/ui · self-hosted PostgreSQL 17 (`pg`) · hand-rolled auth · filesystem storage

> This document is both the specification and the record. Sections marked **as built** were reconciled against the running code and database on 9 Aug 2026, most recently a full line-by-line audit on 18 Aug 2026. Where the build diverged from the original plan, the divergence is described rather than quietly overwritten.
>
> **⚠ Migrated off Supabase — 3 Sep 2026.** GoTrue (auth), PostgREST, and Supabase Storage were removed; the database is now a local Postgres. The *schema* (§3, §4, §15) is unchanged and still authoritative — it lives in `db/*.sql`. The *application-layer* description below and in §16 predates the migration: the request path, auth, and storage now work as described in `CLAUDE.md` → "Architecture", not as written here. §0 is updated; the rest of the prose is not yet reconciled.
>
> **⚠ Snag roles flattened + shared warehouse data + mobile shell — Sep 2026.** Three product changes landed after the migration and are **not yet threaded through every section below** — where §2, §5.7, and §15's snapshot still describe the old model, these three notes govern:
> 1. **Roles flattened.** The Reporter/Resolver permission split is gone. `private.is_reporter()` and `private.is_resolver()` (`db/12_flatten_snag_roles.sql`) both now `select private.is_warehouse_member(warehouse_id)`, so **any tagged member (or Dashboard Admin) can do every task on a snag** — raise, comment, set ETC, change status, close, verify, reopen, set the go-live date. The 6 `member_role` values are labels only: they pick a person's default *side* in the chat feed and their badge colour (`REPORTER_ROLES`/`RESOLVER_ROLES`/`ROLE_COLOR_CLASS` in `lib/roles.ts`), nothing more. The acting-as toggle in the compose box was removed (§5.7.1).
> 2. **Reopen a closed snag.** New RPC `public.reopen_snag(p_snag_id, p_body)` (`db/13_reopen_snag.sql`) — any member or admin; `closed → wip`, clears `closed_at`/`verified_by`/`verified_at`, logs a `reopen` `snag_activity` row, optional chat message. Surfaced at the bottom of the chat for closed snags (§5.7.1). `post_snag_update` was also reopened to accept ETC/status from anyone (`db/14_post_snag_update_open.sql`).
> 3. **Handover documents & Machine and Controller Details.** Two new cards on the warehouse detail page, between the snag table and the Team block — a 15-item commissioning-document checklist with upload/download/history, and an unlimited list of chamber machine specs. New tables in `db/11_handover_and_chambers.sql`. Write access is **any tagged member or admin**. Full description in §5.7.2.
> 4. **Mobile-responsive shell.** The app shell, snag table, admin tables, and filter bar now adapt to phone/tablet widths (off-canvas sidebar drawer below `md`, column hiding, larger tap targets, collapsible filters, an explicit `viewport` export). Described in `DESIGN.md` → "Responsive — as built".

---

## 0. Setup — what a fresh environment needs

Everything required to stand this app up from nothing, so a rebuild doesn't have to reverse-engineer it from the running instance.

**Runtime dependencies** (`package.json`, versions as pinned — see there for the exact devDependency list too, mainly Tailwind 4 and the TypeScript/ESLint toolchain):

| Package | Version | Role |
|---|---|---|
| `next` | 16.3.0 | App Router framework. **Not the Next.js in most training data** — breaking changes; middleware is renamed `proxy` (`src/proxy.ts`, matched by `AGENTS.md`'s standing instruction to read `node_modules/next/dist/docs/` before writing Next-specific code) |
| `react` / `react-dom` | 19.2.8 | |
| `pg` | ^8.23 | PostgreSQL client — the whole data layer (`lib/db`, `lib/pgrest`) |
| `jose` | ^6.2 | Signs/verifies the session-cookie JWT (`lib/auth`) |
| `bcryptjs` | ^3.0 | Password hashing — verifies the migrated GoTrue `$2a$` hashes |
| `@base-ui/react` | ^1.7.0 | Headless primitives underlying `components/ui/*` (Select, etc.) |
| `shadcn` | ^4.16.2 | CLI/registry the `ui/` primitives were generated from |
| `tailwindcss` | ^4 (devDependency) | Utility CSS; v4's CSS-first config, no `tailwind.config.js` — tokens live in `globals.css`'s `@theme` block |
| `tailwind-merge` / `clsx` | ^3.6.0 / ^2.1.1 | Back `lib/utils.ts`'s `cn()` |
| `class-variance-authority` | ^0.7.1 | Variant styling for `ui/button.tsx` etc. |
| `lucide-react` | ^1.30.0 | Icon set (sort arrows, chevrons, etc.) |
| `exceljs` | ^4.4.0 | Import/export (§8) |
| `tw-animate-css` | ^1.4.0 | Animation utility classes |

**Environment variables** (`.env.local`, gitignored) — see `.env.example`:
- `DATABASE_URL` — `postgresql://authenticator@localhost:5433/snagdash`
- `AUTH_SECRET` — signs the session cookie **and** attachment signed-URLs
- `STORAGE_DIR` — filesystem location of the `attachments` bucket
- `AUTH_AUTOCONFIRM` (`true` locally), `MAIL_PROVIDER` (`console` locally)
- `SUPABASE_*`, if present, are migration-tooling only and unread by the app.

**`.mcp.json`** is empty (`{"mcpServers":{}}`) — the Supabase MCP is gone.

**Database:** self-hosted PostgreSQL 17 on port 5433, database `snagdash`, rebuilt from `db/*.sql` via `db/build.sh` (see `db/README.md`). The app connects as the unprivileged `authenticator` role and `SET LOCAL ROLE`s into `anon` / `authenticated` / `service_role` per request, so RLS applies (`CLAUDE.md` → Architecture).

**Postgres extensions** (in the `extensions` schema, so functions with `search_path=''` call `extensions.gen_random_uuid()` / `extensions.similarity()`):
- `pgcrypto` — `gen_random_uuid()`, every table's PK default
- `pg_trgm` — `extensions.similarity()`, duplicate detection (§7)
- `pg_cron` — the daily snapshot job (§12.1); needs `shared_preload_libraries='pg_cron'` + `cron.database_name='snagdash'`
- `uuid-ossp` — installed for parity, not called

**Storage:** one bucket, `attachments`, on the local filesystem under `STORAGE_DIR`. Enforced in `src/app/api/attachments/route.ts` (not a DB policy): 50 MB limit, mime allowlist `image/jpeg|png|webp`, `video/mp4|webm|quicktime`. Served only via HMAC-signed URL from `src/app/api/attachments/[...path]/route.ts`. Path convention unchanged: `{warehouse_id}/{snag_id}/{8-char-random-id}[.ext | -thumb.jpg | -original.jpg]` — segment 1 is still parsed back out for the `attachments` table's own INSERT policy (§4.1).

**Schema source of truth is `db/*.sql`** (was: Supabase-project migrations). §15 remains a literal snapshot of it — enough to reproduce from nothing. There is no migration-history table; edit `db/10_schema.sql` (or add a numbered file) and re-run `db/build.sh`.

**Root layout** (`src/app/layout.tsx`) — `next.config.ts` is untouched default (no custom config at all). Exact `<head>` metadata: title `"Frozen Warehouse Launch Readiness"`, description `"Snag tracking and launch readiness for frozen warehouse commissioning"`. The three `next/font/google` calls, exact weights loaded (see DESIGN.md's Type section for the Instrument Sans weight discrepancy this implies): `Instrument_Sans({ variable: "--font-display", subsets: ["latin"], weight: ["500"] })`, `Inter({ variable: "--font-body", subsets: ["latin"], weight: ["400", "500"] })`, `IBM_Plex_Mono({ variable: "--font-data", subsets: ["latin"], weight: ["400", "500"] })`.

---

## 1. Design decision carried forward

One `snags` table keyed by `warehouse_id`, **not** a physical table per warehouse. The UI renders a table per warehouse; the data stays in one queryable place. This is what makes the cross-warehouse landing cards and roll-up stats possible at all.

### 1a. Signature features — what makes this dashboard distinctive, and why

The rest of this document specifies *how* things are built. This section exists to keep the *why* from getting lost in that — every feature below is a deliberate response to something about frozen-warehouse commissioning specifically, not a generic snag-tracker default. Each links to its full technical treatment elsewhere.

**The readiness thermometer — a gauge, not a progress bar (§5.2.1, `DESIGN.md`'s Signature section).** Every warehouse card carries a fixed 10-band red→green gradient with a marker showing where that warehouse sits. Because the scale is identical and fixed on every card, warehouses can be compared *against each other* at a glance — "which of our four launches is in the worst shape" is a one-second visual scan, not four separate mental calculations. A progress bar (0 → 100% of *something*) can't do that; a gauge with a fixed scale can.

**RAG colour that answers one question: can we open? (§5.2.1)** The red/amber/green isn't severity-coded or generically "how many snags" — it's driven by the specific combination leadership actually asks about: any open High-severity snag, or open% above threshold, or days-to-launch running out with snags still open. A warehouse with 40 low-severity snags can be green; one with a single open High is red. The colour is a launch decision, not a snag count.

**Burn-up, not burn-down (§12).** The chart shows two lines — total raised and total closed — instead of one line for "open count." This is the single most domain-specific decision in the app: in a cold-store commissioning, snags arrive continuously as chambers are pulled to temperature and systems are switched on, so a flat open-count line is ambiguous — it can't tell you whether the team stopped closing things or new things kept arriving, and those two problems need opposite responses (more resolver capacity vs. controlling intake). The burn-up separates them into two lines and shows which one is actually the risk.

**Card order is launch proximity, not alphabetical (§5.2.2).** Warehouses with a go-live date sort soonest-first; undated warehouses sort last, but *among themselves* by open-snag-count descending — so an undated warehouse quietly carrying 40 open snags still surfaces above one carrying two, because it needs a date set more urgently. Nobody has to remember to check on it.

**Duplicate detection catches the same defect logged five times (§7).** Multiple people walking the same chamber independently notice and raise the same fault. Before a snag is written, a `pg_trgm` text-similarity search checks the same warehouse + location + sub-category for a close match on description, and shows the raiser the candidate before letting them decide. This is specifically about reducing noise in a fast-moving, multi-person commissioning site, not a generic form-validation nicety.

**The update thread is a two-sided chat, not a one-way status log (§5.7.1).** Reporters and resolvers see one merged, chronological feed with messages visually sided like a messaging app — reporter left, resolver right, system events centered and unobtrusive. Older versions of this kind of tool tend to make the update log resolver-only, turning the reporter into a passive ticket-filer; here the person who found the problem can keep talking to the person fixing it, in the same place, with the same permanence.

**Mobile raising is designed for a gloved hand at −25 °C, not adapted from desktop (§5.8).** This is the app's most physically-constrained screen and it shows: 56px minimum tap targets (thermal gloves defeat capacitive touch), radio cards instead of dropdowns (nothing that needs precision tapping), camera-first flow, and a hard ceiling of 6 required fields because time inside a blast freezer is deliberately limited. The desktop form is the adaptation of this, not the other way round.

**Offline-capable raising, because warehouse wifi doesn't reach the back of a chamber (§5.8, §14.2).** A snag raised with no signal is queued in IndexedDB with a client-generated id and synced automatically the moment connection returns — including its photos. Nobody has to remember to re-submit anything, and nothing is lost to a dead zone.

**Column-level permissions enforced at the database, not just hidden in the UI (§4).** A reporter physically cannot write `etc_date` or `status`; a resolver physically cannot raise a snag under someone else's name. This isn't a UI convention that a client-side bug could quietly break — every write path is a `SECURITY DEFINER` RPC that checks real warehouse membership before touching a column, so the separation holds even against a malicious or buggy client.

**Excel round-trips through a self-documenting template (§8).** The downloadable import template ships with a live example row and an italic notes row listing every valid value per column, including the exact "High means this stops the warehouse launching" severity guidance. A site engineer working entirely from a spreadsheet, no app access, can fill it out correctly without ever being told the rules out of band.

**Near-total audit trail, added incrementally as real gaps were found (§3.13, §3.4a, §3.4b).** `snag_activity`, `warehouse_activity`, and `people_activity` mean almost nothing changes silently — who raised, who closed, who changed a go-live date, who invited whom, who got tagged to a new warehouse, all timestamped and attributed. §14.3 tracks the handful of actions that still aren't logged, honestly, rather than implying full coverage that doesn't exist.

**Dashboard Admin acts everywhere without being tagged everywhere (§2.2).** A global admin bypasses the reporter/resolver tag check on every snag-adjacent write, but the audit trail still records their real identity, not a generic "admin" actor — so the convenience of a global role never costs you the accuracy of who actually did what.

**Warehouse-scoped visibility respects real organizational boundaries (§2.3).** This isn't one flat pool of snags — a person only ever sees the warehouses they're tagged to. Different launch teams working different sites don't see each other's in-progress problems by default, matching how these commissioning projects are actually staffed and run.

**The go-live date carries its own lightweight history, not a separate audit screen (§5.7, `go-live-history-info.tsx`).** Hover the small info icon next to the date and see every change, who made it, and when — without navigating away from the number that matters most to everyone watching the countdown.

---

## 2. Roles and visibility

### 2.1 Roles

> **⚠ Superseded by the Sep 2026 role-flatten (see the banner at the top).** Everything in this section describing what a role *lets a person do* no longer holds: `is_reporter()`/`is_resolver()` both resolve to `is_warehouse_member()`, so any tagged member can do every snag task. The role table below now only describes each role's **default chat side** (Reporters → left, Resolvers → right) and **badge colour**. The per-warehouse mechanics and the sync-by-hand note are still accurate as *structure*; they just no longer gate anything.

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

**Sep 2026 role-flatten — most of this section is now moot for *tagged members*.** Since `is_reporter()`/`is_resolver()` both became `is_warehouse_member()`, every "bypasses the reporter/resolver tag" clause above still stands, but it now only matters for a Dashboard Admin who is *not* tagged to the warehouse at all — a tagged member already has full snag rights without needing admin status. The `is_dashboard_admin()` OR was kept in every RPC and RLS policy (including the two attachment insert policies) and extended to the two new paths: `reopen_snag` (`db/13`) and the reopened `post_snag_update` (`db/14`), plus the two `warehouse_asset_activity`/handover/chamber write policies (§5.7.2). `snag_activity` still records the admin's own `actor_id`; a `reopen` action is logged there like any other status change.

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
Extends the `auth.users` table (a local shim since the Supabase migration — `db/01_auth_storage_shim.sql`), created on first sign-in by the `handle_new_user()` trigger.

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
| `action` | text — `create`, `activate`, `deactivate`, `go_live_date_change` (added 18 Aug 2026) |
| `field` / `old_value` / `new_value` | text, nullable — populated for `activate`/`deactivate` (`field = "is_active"`) and `go_live_date_change` (`field = "go_live_date"`, both dates as `date`-cast text); `create` rows leave all three null |
| `created_at` | timestamptz |

`set_go_live_date()` writes the `go_live_date_change` row itself (old value read before the update, new value the resolver/admin just set) — not a separate action, so it can't be skipped.

**RLS was widened 18 Aug 2026.** `SELECT` was originally `is_dashboard_admin()` only; it's now `is_dashboard_admin() OR is_warehouse_member(warehouse_id)` (policy renamed `warehouse_activity_select_scoped` to match), so reporters/resolvers can see a warehouse's own history too — needed once the go-live-date hover history (§5.7) started showing it on the warehouse detail page, which they view. `INSERT` stays admin-only — only admin actions and the `set_go_live_date` `SECURITY DEFINER` RPC ever write rows here, never a plain client insert.

### 3.4b `people_activity` — **new table (18 Aug 2026)**

Same shape and intent as `warehouse_activity`, scoped to people instead: logs the two admin actions on the People screen that previously left no trace — inviting someone, and tagging an already-accepted person onto another warehouse via "+ Add warehouse" (§5.6).

| Column | Type |
|---|---|
| `id` | uuid PK |
| `email` | text — the target person, **not** `user_id` |
| `actor_id` | uuid FK → profiles, nullable |
| `action` | text — `invited`, `warehouse_added` |
| `detail` | text, nullable — a pre-built human-readable summary, e.g. `"Invited as HVAC Engineer, tagged to Bhiwandi cold store 1"` or `"Tagged to Nagpur frozen DC"` |
| `created_at` | timestamptz |

**Keyed by `email`, not `user_id`, deliberately.** An invited-but-not-yet-signed-up person has no `profiles.id` at all — email is the only identifier stable across that transition, and it's what the People table's rows are already keyed by.

**`action` + `detail` instead of `warehouse_activity`'s `field`/`old_value`/`new_value` shape, deliberately.** Both actions here are compound, additive "here's what happened" events (a role plus a list of warehouses) rather than one field's clean before/after — trying to split that across `old_value`/`new_value` would be awkward, so the RPC/action builds the summary sentence once and stores it as-is.

Both RLS policies are `is_dashboard_admin()` only, same admin-table convention as `warehouse_activity` and `invitations` — only admins can ever write these two actions, so there's no reporter/resolver case to widen for.

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

### 3.14 Exact display labels — consolidated reference

Every enum's stored value differs in casing/wording from what the UI actually shows, per `lib/roles.ts` and `lib/snags.ts`. §3.7/§3.8 already gave sub-category and location; the rest were only ever implied elsewhere. Full set, in one place:

| Enum | Stored values → displayed labels |
|---|---|
| `category` | `hvac`→"HVAC", `ops`→"Ops" |
| `sub_category` | `odu`→"ODU", `idu`→"IDU", `puff_panel`→"Puff panel", `plc`→"PLC", `door`→"Door", `floor`→"Floor", `piping`→"Piping", `racks`→"Racks", `electrical`→"Electrical", `iot_sensors`→"IoT sensors", `others`→"Others" |
| `location` | `frozen_chamber`→"Frozen chamber", `ante_room`→"Ante room", `odu_area`→"ODU area", `ambient_area`→"WH ambient area" |
| `scope` | `oem`→"OEM", `infra`→"Infra", `admin`→"Admin" |
| `severity` | `high`→"High", `medium`→"Medium", `low`→"Low" |
| `status` | `open`→"Open", `wip`→"WIP", `ready_to_close`→**"Verify"** (not "Ready to close" — the label speaks to what the reporter does next, not the status name itself), `closed`→"Closed" |
| `member_role` | see `lib/roles.ts`'s `MEMBER_ROLES` — "Operations", "HVAC Engineer", "Program Manager (Infra)", "PMC", "PMO", "Warehouse Admin" (exact casing, including the parenthetical on Program Manager) |

**Ageing colour bands** (`ageingClass()` in `lib/snags.ts`) — **not specified anywhere else in this document**, the source code comment says as much: `days >= 14` → `text-red`, `days >= 7` → `text-amber-deep`, otherwise → `text-muted-foreground`. Chosen as a reasonable default (under a week / one-to-two weeks / beyond) when this was built; §5.7 only ever said "colour-banded" without numbers.

Excel import matches enum cells **against these labels, case-insensitively** (§8), not against the raw stored value — a cell reading `hvac`, `HVAC`, or `Hvac` all resolve to the same stored `hvac`.

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

- **`/set-password`** (first-time signup) — full name + email + password + confirm password → `supabase.auth.signUp()` (now `src/lib/auth/service.ts`, which inserts an `auth.users` row). This fires `handle_new_user()` (§3.2, §4), the trigger that checks `invitations` for a matching email and creates the `profiles` row — **no matching invitation → the insert fails on the trigger's exception**, surfaced by `setPassword()` (`app/set-password/actions.ts`) as an inferred `not_invited` error (weak-password and already-exists are ruled out first, then not-invited by elimination). With `AUTH_AUTOCONFIRM=true` (local) the signup also issues a session immediately.
- **`/login`** (returning users) — email + password → `signInWithPassword()`. Failure redirects to `/login?error=invalid_credentials`.
- **`/forgot-password`** → `/auth/update-password`, via `/auth/confirm` (a `route.ts` handler that calls `verifyOtp()` on the emailed token, then redirects). Always shows the same "check your email" message regardless of whether the address exists — Supabase never reveals that. **Known gap:** the Supabase-side "Reset Password" email template still uses the default `{{ .ConfirmationURL }}` rather than being repointed at `/auth/confirm`, so the emailed link doesn't actually work yet — a one-time dashboard edit outside this codebase's reach (see the CLAUDE.md gotcha for the exact template string needed).
- Session state: a signed JWT in an httpOnly cookie (`src/lib/auth/session.ts`, jose HS256, `AUTH_SECRET`), verified on every request by `src/proxy.ts` (Next.js 16 renamed middleware to "proxy" — `AGENTS.md`) calling `updateSession()` (`lib/data/proxy.ts` → `lib/auth/jwt.ts`), which gates every route except `/login`, `/auth/*`, `/forgot-password`, `/set-password`, `/api/*` by requiring a valid session — redirecting to `/login` otherwise. Server code reads it via `getClaims()` (unchanged call surface).

Because the gate is the email address, a user invited as `x@company.com` must sign in with exactly that address — a personal Gmail will not match. The User Management screen should say so.

**As built — exact error copy** (each page has its own `ERROR_COPY` map, `Record<string, {title, body}>`, rendered in an accent-tinted box above the form; `/auth/update-password`'s is a flat `Record<string, string>`, one line, no title). All four pages share one hardcoded, page-local (not imported/shared) 8-stop gradient strip across the card's top edge — except `/auth/update-password`, which has none (§ DESIGN.md's "Signature: the readiness thermometer", corrected 19 Aug 2026 — this was previously mis-documented as also appearing on modal headers, which it never has).

`/login`:
| Error key | Title | Body |
|---|---|---|
| `not_invited` | "This email isn't set up yet" | "We don't have an invitation for that address. Ask your dashboard admin to add it, then sign in with that exact address." |
| `invalid_credentials` | "Couldn't sign you in" | "That email and password combination doesn't match an account." |

`/set-password`:
| Error key | Title | Body |
|---|---|---|
| `missing_fields` | "Missing information" | "Fill in every field before submitting." |
| `not_invited` | "This email isn't set up yet" | "We don't have an invitation for that address. Ask your dashboard admin to add it, then come back with that exact address." |
| `already_exists` | "This email already has an account" | "Sign in instead, or use Forgot password if that account needs a password set." |
| `password_mismatch` | "Passwords don't match" | "Type the same password in both fields." |
| `weak_password` | "Choose a stronger password" | "That password is too easy to guess. Try something longer or less common." |

Success (no error, `?success=1`): title "Almost there", body "Check your email to confirm your address, then sign in."

**Stale copy found 19 Aug 2026, not fixed — flagging, not silently correcting.** `/set-password`'s subtitle still reads *"For people invited by email who don't sign in with Google."* — a leftover from before Google sign-in was reverted (this section's own opening paragraph). Read literally today it implies Google sign-in still exists as an alternative elsewhere in the app, which is false. Exact current text is captured here for reproduction fidelity; whether to fix the actual copy is a product call outside a documentation pass.

`/forgot-password`: no keyed error map, just one conditional block — shown when `error=invalid_or_expired`: title "That link didn't work", body "It may have expired or already been used. Request a new one below." Success (`?sent=1`): title "Check your email", body "If an account exists for that address, a reset link is on its way." (deliberately identical whether or not the address exists, per the paragraph above).

`/auth/update-password`: `password_mismatch` → "Those passwords don't match.", `weak_password` → "That password is too easy to guess. Try something longer or less common.", `unknown` → "Something went wrong. Try requesting a new reset link." This page also redirects to `/forgot-password?error=invalid_or_expired` itself, before rendering anything, if `getClaims()` finds no session — the one case where a *different* page's error copy is what the user actually sees.

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
- **About the page** — every signed-in user, directly below Home (added 18 Aug 2026, §5.3a)
- Heading **Warehouses**, then every warehouse the current user can read (§2.3) — all of them for a Dashboard Admin, only tagged ones otherwise
- **Warehouse management** — Dashboard Admin only. Renamed from "+ Add Warehouse" once the screen grew Manage-existing capability (§5.5)
- **User Management** — Dashboard Admin only, lives here per your instruction

### 5.3a About the page — **new screen (18 Aug 2026)**

`/about`, linked from the sidebar right below Home, visible to everyone signed in. A static explainer: what the product is for (cold-storage warehouse launch readiness — surfacing snags so nothing blocks opening day by surprise), then the two operational role categories side by side —

- **Reporters** (HVAC Engineer, Operations, Warehouse Admin) — raise a snag, comment on any snag on a warehouse they're tagged to, close a ticket directly, confirm/reject once a resolver marks it ready to close
- **Resolvers** (Program Manager (Infra), PMC, PMO) — comment with photos/video, set ETC, move status to WIP or ready-to-close, set the warehouse's go-live date

**Deliberately omits Dashboard Admin** — by request, not oversight. Don't add it back without checking; see the `CLAUDE.md` gotcha on this page. Also states plainly that a person holds one role across every warehouse they're tagged to (§2.1's 17 Aug narrowing), not a different one per warehouse.

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

**As built (18 Aug 2026) — rows expand to show change history, logged to `people_activity` (§3.4b).** A one-line hint, exact text **"Click a row to see its change history."**, sits above the table. **Correction (25 Aug 2026):** this was previously described as "matching the equivalent hint on the snag table" — it doesn't. Every "click a row" hint in the app uses genuinely different wording; see §5.9's full copy catalog. `createInvitation` and `addWarehouseMembership` both now log a `people_activity` row on success; clicking a row (`PersonRow`, mirroring `WarehouseRow`'s expand pattern) shows that person's history — timestamp, actor, and a plain-language summary. **Still not logged anywhere**, found the same day: deactivating/reactivating a person (`set_user_active`) — the same function at the center of the `is_active` enforcement gap below — and there's no action at all yet to remove a warehouse tag or change an already-signed-in person's Dashboard Admin status, so neither has anything to log.

### 5.7 Warehouse detail
Opens from a card or the sidebar.

The screen opens with a **header block above the snag table**, laid out in two parts (originally three — see below):

**1. Metrics** — a compact row of figures:

| Metric | Note |
|---|---|
| Total raised | |
| Open | |
| Closed | |
| Open High | Drives the readiness colour |
| Go-live date | Editable inline by resolvers |
| Days to go-live | Derived |

**As built (18 Aug 2026) — a small hover info icon sits next to the go-live date** (both the editable and read-only header variants), showing its change history (`GoLiveHistoryInfo`, reading `warehouse_activity`'s `go_live_date_change` rows, §3.4a) — timestamp, actor, old date → new date. Built as two nested CSS boxes rather than one: the outer box carries an invisible padding bridge (not a margin gap) between the icon and the visible tooltip, and drops `pointer-events-none`, so moving the mouse from the icon down into the tooltip doesn't cross a dead zone that would drop the hover state — a first version got this wrong and the tooltip closed before you could read a long list. The list itself is height-capped and scrolls under a fixed heading.

**2. Burn-up chart** — the only chart in the product, rendered here and nowhere else.

- Two cumulative lines: **total raised** and **total closed**; the shaded gap between them is the open count
- Runs from the warehouse's first snag to its go-live date, with the trend projected forward past today
- Answers whether the gap will reach zero by go-live, and — critically — whether a miss is caused by slow closure or by growing scope
- Reads from `snag_daily_snapshot` (§12.1), so it is a cheap query rather than an aggregation over `snags`
- Degrades gracefully: with under ~7 days of snapshots it shows "collecting data" rather than a misleading two-point line. With no go-live date set, it plots history without a target line
- The "Hover for daily figures" hint (top-right of the chart) originally read "weekly" — a leftover from an early draft; the tooltip has only ever shown one day's totals at a time, so the label was corrected 18 Aug 2026 to match

**Team** — everyone tagged to this warehouse, grouped by role, own block **below the snag table** rather than in the header. Because a role can hold several people (§3.4), this collapses to a summary with an expand control rather than listing every name inline. **Moved out of the header block 18 Aug 2026** — was originally the header's first part, above Metrics; the header is genuinely two parts now, not three.

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

### 5.7.1 Update thread — **rebuilt as a two-sided chat (14 Aug 2026), then de-toggled for the Sep 2026 role-flatten**

> **⚠ Sep 2026 changes to this section:**
> - **The compose box has no acting-as toggle any more.** Every tagged member sees the *same* full box — comment, photo, video, ETC date, status dropdown, and the close / confirm / reject buttons. There is no "Commenting as Reporter / Resolver" switch. `snag-compose.tsx` still computes a `composeSide` (`resolver` if the person holds only a Resolver-list role, else `reporter`) so the message lands on the right side of the feed, but the person never picks it and never sees it named. `p_acting_as` is still passed to `post_snag_update` and still snapshotted into `author_side`; it is now derived, not chosen.
> - **Admin comments render on the left.** `author_side = 'admin'` now sits on the **left** with the reporter side (was centered/neutral before). A Dashboard Admin with no tag on the warehouse gets the same single box, with a quiet "Commenting as Dashboard Admin" line instead of a toggle.
> - **A closed snag *does* have a compose area** — a compact reopen-only form: a note that the snag is closed, an optional "why are you reopening this?" textarea, and a "Reopen snag" button calling `reopen_snag` (§2.2, `db/13`). The full compose box returns once the snag is back to WIP. (This reverses the 17 Aug 2026 "a closed snag has no compose box at all" decision below.)

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

### 5.7.2 Handover documents & Machine and Controller Details — **new cards (Sep 2026)**

Two cards on the warehouse detail page, rendered **between the snag table and the Team block**. Both are open to **anyone tagged to the warehouse** (any role) and to Dashboard Admins — not a reporter-only or resolver-only surface. Backed by `db/11_handover_and_chambers.sql`; server actions in `src/app/(app)/warehouses/[id]/asset-actions.ts`; components `handover-documents.tsx` and `chamber-details.tsx`.

**Handover documents** — a fixed 15-item commissioning-document checklist (HOTO set). The list of document names lives as reference rows in `handover_document_types` (fixed UUIDs `11111111-1111-4111-8111-0000000000NN`, `sort_order` 1–15; names are inline in the SQL). Per warehouse, each item is one `warehouse_handover_documents` row (`unique (warehouse_id, doc_type_id)`).

- **Collapsed by default**, with an Expand / Collapse button on the card's header strip (same `bg-line` tone as the snag-table header). Header also shows an "X of Y uploaded" count.
- Each row: a bold filled-square indicator (filled + checkmark when a file is attached, empty otherwise), the document name, an inline **Download** link when a file exists, and a per-row **History** button when that document has any activity.
- **The tick is automatic.** `checked` is set `true` on upload and back to `false` on remove — there is no user-operated checkbox. A DB `CHECK` constraint (`checked_requires_file`) enforces `checked = false OR file_url IS NOT NULL`.
- **Upload / Replace** and a small **×** remove control show only when `canEdit`. Files reuse the `attachments` bucket under a `{warehouse_id}/handover/` prefix and the existing `/api/attachments/[...path]` serve route; replacing or removing deletes the old blob.
- **History** opens a modal (`HistoryModal`) titled "History" with the document name as a subtitle, listing every upload / replace / remove for that one document — timestamp, actor, action — read from `warehouse_asset_activity` (`area = 'handover_document'`, `ref_label` = the document name).

**Machine and Controller Details** — an unlimited list of chambers, one `warehouse_chambers` row each. Fields: **Chamber name**, **No. of machines** (int), **Capacity (kW)** (`real`), **ODU model**, **IDU model**, **Controller model**.

- Header strip carries a "**+ Add Chamber**" button (shown when `canEdit`). Adding reveals an inline draft row of inputs; Save / Cancel.
- Existing rows show inline with an **Edit** button and a **×** delete (both `canEdit` only). Edit swaps the row for the same inline input set.
- On narrow screens the row stacks and each cell gets its own `sm:hidden` label (`CellLabel`) since the column header row is hidden below `sm`.
- Every add / edit / delete is logged to `warehouse_asset_activity` (`area = 'chamber'`).

**`warehouse_asset_activity`** is a shared append-only audit table for both cards (`warehouse_id`, `actor_id → profiles(id)`, `area`, `ref_label`, `action`, `detail`, `created_at`). It is in the shim's `EMBED_FK` map as `warehouse_asset_activity.actor → actor_id`. RLS: select for members/admins; insert for members/admins. The server actions also re-check membership up front (`assertMember`), because an RLS-blocked `UPDATE`/`INSERT` is a silent 0-row no-op rather than an error.

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

**As built — exact offline-queue mechanics** (`lib/offline-queue.ts`, `lib/sync-queue.ts`): a single IndexedDB database, name `snag-offline-queue`, version `1`, one object store `pending-snags` keyed by `localId` (the client-generated snag uuid). `enqueueSnag`/`listQueuedSnags`/`removeQueuedSnag` are the only three operations — no update-in-place. `syncOfflineQueue()` runs on mount (`PendingSyncBanner`, §14.2) and on the browser's `online` event: for each queued item in order, it calls `raise_snag` with `p_id: localId` (so the client-generated uuid becomes the real primary key, not a throwaway) and then uploads any queued photos via `uploadAttachment`. **Stops at the first failing item** rather than skipping it — a mid-queue failure (e.g. lost membership, network drop) leaves the rest queued in their original order rather than silently reordering or dropping them. Only removed from IndexedDB after a fully successful raise + all photo uploads.

### 5.9 Exact validation, empty-state, placeholder, and subtext copy — consolidated reference

Every client-side validation message, empty-state string, input placeholder, and screen subtitle outside of auth (§5.1 has those), verified by grepping the whole `src/` tree on 19 and 24 Aug 2026 — this is now the full set of copy with behavioral or orienting weight (what a user reads to understand *what a field wants*, *why something didn't work*, or *what screen they're on*), as opposed to purely structural labels (column headers, button text that just names its own action) that §14.3 explains this document still doesn't transcribe.

**Client-side validation errors** (shown inline, not via redirect+query-param like §5.1's):
| Text | Where |
|---|---|
| "Email and a role are required." | Invite form, §5.6 |
| "Pick at least one warehouse." | Both the invite form's warehouse picker and "+ Add warehouse" (§5.6) |
| "This person has no role on file, so they can't be tagged to a warehouse here." | `addWarehouseMembership`, §5.6 — should be unreachable in practice since every accepted profile has a `default_role` |
| "Warehouse code can't be empty." | `createWarehouseCode`, §5.4–5.5 |
| "All fields are required." | `raiseSnag`, §5.8 / Add Snag form |
| "Add a comment before sending." | Chat compose box's "Send" button, §5.7.1 |
| "Could not read that video file." | Video capture control, §6 |

**Empty states:**
| Text | Where |
|---|---|
| "No warehouses yet. Use "Warehouse management" in the sidebar to create the first one." | Landing page, zero readable warehouses |
| "None yet" | Sidebar warehouse list, zero readable warehouses |
| "No warehouses match this filter." | Warehouse Management table, §5.4–5.5 |
| "No history yet." | Both Warehouse Management's and People Management's expanded-row history (§3.4a, §3.4b) — identical text, two different screens |
| "No changes recorded yet." | Go-live date hover history, §5.7 |
| "No one invited yet." | People Management, zero rows |
| "No snags match this filter." | Snag table, §5.7 |
| "No one tagged to this warehouse yet." | Team block, §5.7 |

**"Click a row..." hints — genuinely three different sentences, not one reused string:**
| Text | Screen |
|---|---|
| "Click a row to expand its update log and see attached photos/videos." | Snag table, §5.7 |
| "Click a row to see its status history." | Warehouse Management, §5.4–5.5 |
| "Click a row to see its change history." | People Management, §5.6 |

**Other found while cross-checking (25 Aug 2026):**
| Text | Where |
|---|---|
| "Add new warehouse code" | Field label, Warehouse Management's create form |
| "Queued — pending sync" (title) / "No connection right now. This snag is saved on your device and will be raised automatically once you're back online." (body) | Add Snag form, offline state (§5.8) |

**Input placeholders** (every `placeholder=` in the codebase outside auth, which already has its own three `priya@company.com` instances, §5.1):
| Text | Field | Where |
|---|---|---|
| "Warehouse code" | Warehouse code input | Warehouse Management, §5.4–5.5 |
| "Search description…" | Search box | Snag table, §5.7 (note the real ellipsis character `…`, not three periods) |
| "Add description" | Description textarea | Add Snag form, §5.8 |
| "Describe the sub-category" | Sub-category-other textarea | Add Snag form, shown only when Sub-category = Others |
| "name@company.com" | Email input | Invite form, §5.6 |
| "Search or select…" | `role-people-picker.tsx` — **dead code**, not reachable in the running app (§5.4a) |
| "Add a comment" | Chat compose textarea | §5.7.1 |

**Screen subtitles** (the small muted line directly under a screen's `<h1>`, where one exists — several screens have none, noted as such):
| Screen | Subtitle text |
|---|---|
| Landing (`/`) | none — goes straight from the header bar into the summary cards |
| Warehouse detail | none — go-live date sits where a subtitle would, in the header's top-right instead (§5.7) |
| Warehouse Management | none |
| People Management | "Add someone's work email and the role they'll hold by default. They sign in with that exact address — a personal account won't match." |
| About the page | "Frozen Warehouse Launch Readiness tracks defects — snags — found while a cold-storage warehouse is being built and commissioned, so nothing blocks opening day by surprise. Everyone can see what's still open across a warehouse; the two roles below are the people who raise issues and the people who close them." |
| Import snags | the warehouse's name (dynamic, not static copy) |
| Raise a snag | the warehouse's name (dynamic, not static copy) |
| `/login` | "Sign in to continue" |
| `/set-password` | "For people invited by email who don't sign in with Google." — the stale Google reference flagged above |
| `/forgot-password` | "We'll email you a link to choose a new one." |
| `/auth/update-password` | "Choose a new password for your account." |

---

## 6. Media handling

**Backend: local filesystem** (was Supabase Storage until the 3 Sep 2026 migration). Files under `STORAGE_DIR`; upload + authorization in `src/app/api/attachments/route.ts`, served via HMAC-signed URL from `src/app/api/attachments/[...path]/route.ts`. ImageKit stays available if delivery performance later justifies putting it in front.

- **Photo annotation before save** — canvas overlay for circling the defect; original preserved in `original_url` alongside the annotated version
- **Client-side compression before upload** — resize to a sane max dimension and re-encode. This matters more than usual: uploads happen over warehouse wifi, from a phone, in a −25 °C chamber
- **Video** needs a hard size cap and a max duration, enforced client-side before upload begins
- Thumbnails generated client-side on upload (the storage backend does not transform media)
- Storage buckets are private; the app serves signed URLs

**As built — exact numbers** (`lib/media.ts`):

| Constant | Value | Applies to |
|---|---|---|
| `MAX_DIMENSION` | 1600px (longest edge) | Photo, annotated + original, re-encoded via canvas |
| `THUMB_DIMENSION` | 320px (longest edge) | Thumbnail, both photo and video |
| JPEG quality | 0.85 full-size, 0.7 thumbnail | `canvas.toBlob` quality param |
| `MAX_VIDEO_BYTES` | 50MB (`50 * 1024 * 1024`) | Same limit as the storage bucket's own cap (§0) — belt and suspenders |
| `MAX_VIDEO_SECONDS` | 60 | Enforced client-side; video thumbnail is a frame captured at `min(0.5s, duration/2)` |

Every attachment upload writes up to three storage objects under one path prefix — `{base}.jpg`/`.mp4`, `{base}-thumb.jpg`, and (photos only) `{base}-original.jpg` — then one `attachments` table row referencing all three URLs, in that order (storage first, then the row; a storage failure never leaves an orphaned row, but a row-insert failure after a successful storage upload can leave an orphaned object — not currently cleaned up).

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

**As built — exact spec** (`lib/excel.ts`, via `exceljs`):

**Export** (`exportSnagsToExcel`) — one worksheet, `"Snags"`, bold header row, file named `{warehouseName, non-word-chars replaced with _}-snags.xlsx`. Columns, in order, with their exact `exceljs` width:

| Header | Key | Width |
|---|---|---|
| S.No | `serial_no` | 8 |
| Date Raised | `date_raised` | 13 |
| Raised By | `raised_by` | 22 |
| Description | `description` | 45 |
| Category | `category` | 10 |
| Sub-category | `sub_category` | 14 |
| Location | `location` | 16 |
| Scope | `scope` | 10 |
| Severity | `severity` | 10 |
| Status | `status` | 13 |
| ETC | `etc_date` | 13 |
| Ageing (days) | `ageing` | 13 |
| Overdue | `overdue` | 10 |

Every enum column exports its **display label**, not the raw enum value (`SUB_CATEGORY_LABELS` etc., §3.14) — sub-category exports the free-text `sub_category_other` instead of "Others" when set. `Overdue` is the literal string `"Yes"`/`"No"`.

**Import template** (`downloadImportTemplate`) — one worksheet, `"Import"`, headers `Description, Category, Sub-category, Sub-category Other, Location, Scope, Severity` (Description column width 45, all others 20), then exactly two data rows:
1. A real example: `"Evaporator fan not coming back on after defrost cycle"`, HVAC, ODU, *(blank)*, Frozen chamber, Infra, High.
2. An italic notes row (`color: {argb: "FF8A7A75"}`) — Description reads `"↑ Example row — delete before importing."`; every other cell lists that column's valid values joined by `" / "` (e.g. Category's cell literally reads `"Valid: HVAC / Ops"`); the Severity cell additionally appends the exact §3.6 sentence, `". High means this stops the warehouse launching."`.

**Import parsing** (`parseImportFile`) — reads only the first worksheet. Row 1 is always skipped as the header. A row is silently skipped (not an error) if its Description starts with `"↑ Example row"`, or if Description/Category/Sub-category are all empty (blank row). Every enum cell is matched **case-insensitively against the display label**, not the raw enum value (`reverseLookup`, §3.14) — typing `hvac` or `HVAC` both resolve, but the underlying value stored is the enum (`hvac`), never the label. Validation order per row, first failure wins: Description required → Category valid → Sub-category valid → Sub-category Other required if Sub-category is Others → Location valid → Scope valid → Severity valid. Every row is validated before any row is committed (no partial-batch commits); each valid row is then raised through the same `raise_snag` path a manual Add Snag uses (§7's duplicate-detection RPC is **not** run for imports — there's no per-row duplicate check on the import path).

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
| Media storage | **local filesystem** (`STORAGE_DIR`), private, HMAC signed URLs, client-side compression — was Supabase Storage pre-migration |
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
- **Projection** — both lines' recent slopes extended to the go-live date. **As built:** the slope is `(today's total − total 7 days ago) / 7` (fewer days if less history exists), not a slope over the whole history, so a burst of activity weeks ago doesn't skew today's line — then `today's total + slope × days-to-go-live`, floored at today's total so a negative slope can't draw the dashed line dipping below the last real point. Only drawn if a go-live date is set and still in the future; no target, no dashed line

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

**`total_raised`/`total_closed` are recomputed from live `snags` counts on each run, not a true ever-incrementing ledger** — so a snag deleted directly at the database layer (no UI path does this, but nothing blocks it) would show up as both totals dropping on that day's snapshot, which the chart's two-cumulative-lines premise can't represent sensibly. **As built (18 Aug 2026, revised same day):** `BurnUpChart` finds the most recent day either total actually dropped and starts the visible series there, discarding everything before it — purely at render time, not a fix to the snapshot function itself. A first attempt clamped each day's displayed total to never fall below the prior day's instead; that was wrong whenever *today's* real count sits below a stale pre-drop peak (exactly Bhiwandi cold store 1's case after its test data was reset) — the clamp pinned the chart at that fictional peak forever, since today's true value could never climb back above it. Truncating instead of clamping shows the honest, currently-valid run of history.

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

All ten phases shipped, then many further rounds of live feedback and fixes, then the 3 Sep 2026 migration off Supabase. The schema source of truth is now `db/*.sql` in the repo (rebuilt via `db/build.sh`); there is no migration-history table.

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
| `people_activity` — a new audit-log table for two previously-untracked People-screen actions (invite, warehouse tag added), never in the original plan | §3.4b |
| `warehouse_activity` gained a third action (`go_live_date_change`) and its `SELECT` policy was widened from admin-only to admin-or-warehouse-member | §3.4a |

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
- **People Management rows are now expandable** ("Click a row to see its change history." hint above the table), showing `people_activity` history per person — see §5.6.
- **Go-live date gained a hover history icon** next to it, on both the editable and read-only header — see §5.7.
- **Team block moved from the top of the warehouse detail header to its own block below the snag table** — see §5.7.

### 14.3 Known gaps

- **Migrations are not in version control.** They exist only in the Supabase project. `npx supabase db pull` writes them to `supabase/migrations/` — do this before any environment move.
- **No soft delete for warehouses** (§5.5).
- **Category and scope are deferred on mobile**, so they are nullable for mobile-raised snags. The "finish this snag" prompt back at a desk was never built.
- **Notifications** were never started — overdue ETC is visible in the UI but nothing reaches the person who can act on it. The chat thread (§5.7.1) has the same gap: no live push, so a new message from the other side is only seen on your own next action or reload, not in real time.
- **Password-reset email now depends on a real `MAIL_PROVIDER`.** `resetPasswordForEmail()` (`src/lib/auth/service.ts`) builds a `/auth/confirm?token_hash=…&type=recovery&next=/auth/update-password` link and hands it to `sendMail()` (`src/lib/auth/email.ts`). Locally `MAIL_PROVIDER=console` just logs the link; shipping this needs the `sendMail()` body wired to a real provider (Resend / SES / nodemailer). The old one-time Supabase dashboard template edit no longer applies.
- **"Deactivate" in User Management does not currently revoke access — found 18 Aug 2026, not yet applied.** `set_user_active()` writes `profiles.is_active`, but nothing reads it: not `private.is_dashboard_admin()`, not `private.is_warehouse_member()`, not `private.has_warehouse_role()` (which `is_reporter`/`is_resolver` both call), no RLS policy anywhere, no auth/proxy gate. Confirmed by searching every function body and every policy in the schema for `is_active` — `set_user_active` is the only hit. A deactivated person can still sign in and use every capability they had before; only the status badge changes. A fix was drafted — gate those three primitive functions on `is_active` (they're what every RLS policy and RPC route through, so this cascades everywhere at once) and add a self-deactivation guard to `set_user_active` (there's exactly one active Dashboard Admin today; without the guard they could lock themselves out with no one left to undo it) — but applying it was declined for this pass. The SQL is in this session's transcript if picked back up later.
- **Not everything about a person is tracked, even after `people_activity` (§3.4b) closed two of the gaps — found 18 Aug 2026.** Still nothing logs deactivating/reactivating a person (`set_user_active`, same function as the gap above), and there's no action at all yet — so nothing to log — for removing a warehouse tag or for changing an already-signed-in person's Dashboard Admin status.
- **`/set-password`'s subtitle still references Google sign-in — found 19 Aug 2026, not fixed.** See §5.1's exact-copy table. Leftover from before Google auth was reverted; reads as if Google is still an option elsewhere, which it isn't anywhere in the app.

**Where this document's precision used to stop, until it didn't.** Through 25 Aug 2026, this section said the last gap was left standing on purpose: purely structural UI text with no behavioral weight (column headers, self-describing button labels) wasn't transcribed anywhere, because doing so "would mean copying most of the source into markdown rather than describing it." **On 1 Sept 2026, asked to close that gap anyway, it was closed literally.** §16 is the entire application source tree — every `.ts`/`.tsx` file, every root config file, `globals.css` — embedded verbatim. There is no longer any UI text, however structural or decorative, that isn't captured somewhere in this document: either described with intent in the sections above, or simply *present*, byte-for-byte, in §16. A rebuild no longer has to trust any prose description at all where §16 covers the same ground — it can read the actual component.

This changes what "keeping this document accurate" means going forward: §16 is a snapshot, and unlike the prose sections (which describe intent and mostly survive small edits), it goes stale the instant a single line of source changes. Treat it the way §15 is already treated — regenerate it from the live repository rather than hand-patching it, and don't trust it for a codebase that's since moved on without re-syncing it first.

**A caught error, left visible rather than quietly fixed.** This same pass initially mis-stated Add Snag as using Import's narrow page container, from generalizing "these two screens look similar" instead of reading each file. Corrected in DESIGN.md's "Screen-by-screen layout" section. Recorded here as a concrete reminder that even a systematic pass can introduce a wrong "fact" if it generalizes instead of verifying — the fix for that is always the same one this whole document has used throughout: read the actual file, don't infer from a sibling.

---

## 15. Full SQL reference — every table, function, view, trigger, and RLS policy, as deployed

**Why this section exists.** §3 and §4 describe the schema and permission model in prose — enough to understand and extend it, but not enough to reproduce it byte-for-byte from a from-scratch environment with no live database to inspect. This section is the literal, verified `pg_get_functiondef`/`pg_get_constraintdef`/`pg_policies` output pulled directly from the running project on 18 Aug 2026, so a rebuild doesn't have to re-derive exact exception messages, exact check ordering, or exact predicate text from behavioral descriptions. Apply in this order: extensions (§0) → enum types → tables → views → functions → triggers → RLS policies. If this section and the prose above it ever disagree after a future change, **this section is stale, not wrong-by-design** — update it from the live project the same way it was built.

> **⚠ This snapshot predates `db/11`–`db/14` (Sep 2026) and does not include them.** Since the snapshot was taken, the numbered SQL files added:
> - `db/11_handover_and_chambers.sql` — tables `handover_document_types`, `warehouse_handover_documents` (with the `checked_requires_file` CHECK), `warehouse_chambers`, `warehouse_asset_activity`; their `*_set_updated_at` triggers; and their select/insert/write RLS policies (member-or-admin). See §5.7.2.
> - `db/12_flatten_snag_roles.sql` — redefines `private.is_reporter()` / `private.is_resolver()` to `select private.is_warehouse_member($1)`. The function bodies in §15.4 below still show the old role-list logic.
> - `db/13_reopen_snag.sql` — adds `public.reopen_snag(uuid, text)`.
> - `db/14_post_snag_update_open.sql` — replaces `public.post_snag_update(...)` to drop the reporter-can't-set-ETC/status block. The §15.4 body is the pre-change version.
>
> Regenerate this whole section from the running DB (after `db/build.sh`) to pick these up.

### 15.1 Enum types

```sql
create type public.member_role as enum ('operations','hvac_engineer','program_manager_infra','pmc','pmo','warehouse_admin');
create type public.snag_category as enum ('hvac','ops');
create type public.snag_sub_category as enum ('odu','idu','puff_panel','plc','door','floor','piping','racks','electrical','iot_sensors','others');
create type public.snag_location as enum ('frozen_chamber','ante_room','odu_area','ambient_area');
create type public.snag_scope as enum ('oem','infra','admin');
create type public.snag_severity as enum ('high','medium','low');
create type public.snag_status as enum ('open','wip','ready_to_close','closed');
create type public.snag_update_side as enum ('reporter','resolver','admin');
create type public.attachment_media_type as enum ('image','video');
create type public.snag_action_result as (snag public.snags, update_id uuid);
```

`snag_location`'s `ambient_area` enum value is the stored value — the UI label is "WH ambient area" (§3.8), the rename was label-only, never a migration.

### 15.2 Tables

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  is_dashboard_admin boolean not null default false,
  default_role public.member_role,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.invitations (
  id uuid primary key default extensions.gen_random_uuid(),
  email text not null unique,
  default_role public.member_role,
  grant_dashboard_admin boolean not null default false,
  invited_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  warehouse_ids uuid[] not null default '{}'
);

create table public.warehouses (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null unique,
  go_live_date date,
  snag_counter integer not null default 0,
  site_location text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);

create table public.warehouse_members (
  id uuid primary key default extensions.gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  unique (warehouse_id, user_id, role)
);

create table public.warehouse_activity (
  id uuid primary key default extensions.gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  action text not null,
  field text,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);

create table public.people_activity (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  actor_id uuid references public.profiles(id),
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index people_activity_email_idx on public.people_activity (email);

create table public.snags (
  id uuid primary key default extensions.gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  serial_no integer not null,
  date_raised date not null default current_date,
  raised_by uuid not null references public.profiles(id),
  description text not null,
  category public.snag_category not null,
  sub_category public.snag_sub_category not null,
  sub_category_other text,
  location public.snag_location not null,
  scope public.snag_scope not null,
  severity public.snag_severity not null,
  status public.snag_status not null default 'open',
  etc_date date,
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (warehouse_id, serial_no),
  constraint sub_category_other_required check (
    sub_category <> 'others' or (sub_category_other is not null and length(trim(sub_category_other)) > 0)
  )
);

create table public.snag_updates (
  id uuid primary key default extensions.gen_random_uuid(),
  snag_id uuid not null references public.snags(id) on delete cascade,
  body text not null,
  author_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  author_side public.snag_update_side not null
);

create table public.attachments (
  id uuid primary key default extensions.gen_random_uuid(),
  snag_id uuid not null references public.snags(id) on delete cascade,
  update_id uuid references public.snag_updates(id) on delete cascade,
  media_type public.attachment_media_type not null,
  file_url text not null,
  original_url text,
  thumbnail_url text,
  file_name text,
  file_size bigint,
  duration_seconds integer,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.snag_activity (
  id uuid primary key default extensions.gen_random_uuid(),
  snag_id uuid not null references public.snags(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  action text not null,
  field text,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);

create table public.snag_daily_snapshot (
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  snapshot_date date not null,
  total_raised integer not null default 0,
  total_closed integer not null default 0,
  open_count integer not null default 0,
  open_high_count integer not null default 0,
  primary key (warehouse_id, snapshot_date)
);
```

### 15.3 Views

```sql
create view public.warehouse_readiness with (security_invoker = true) as
select w.id, w.name, w.go_live_date, w.site_location,
       count(s.id)::int as total_raised,
       count(s.id) filter (where s.status <> 'closed')::int as open_count,
       count(s.id) filter (where s.status <> 'closed' and s.severity = 'high')::int as open_high_count
from warehouses w
left join snags s on s.warehouse_id = w.id
group by w.id, w.name, w.go_live_date, w.site_location;

create view public.snags_with_derived with (security_invoker = true) as
select id, warehouse_id, serial_no, date_raised, raised_by, description, category,
       sub_category, sub_category_other, location, scope, severity, status, etc_date,
       verified_by, verified_at, closed_at, created_at, updated_at,
       (coalesce(closed_at::date, current_date) - date_raised) as ageing_days,
       (etc_date is not null and etc_date < current_date and status <> 'closed') as is_overdue
from snags s;
```

### 15.4 Functions

```sql
-- private schema — permission primitives, everything else routes through these three

CREATE OR REPLACE FUNCTION private.is_active_user()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  select coalesce((select p.is_active from public.profiles p where p.id = (select auth.uid())), false);
$function$;

CREATE OR REPLACE FUNCTION private.is_dashboard_admin()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  select coalesce((select p.is_dashboard_admin from public.profiles p where p.id = (select auth.uid())), false)
    and private.is_active_user();
$function$;

CREATE OR REPLACE FUNCTION private.is_warehouse_member(p_warehouse_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  select private.is_active_user() and exists (
    select 1 from public.warehouse_members wm
    where wm.warehouse_id = p_warehouse_id and wm.user_id = (select auth.uid())
  );
$function$;

CREATE OR REPLACE FUNCTION private.has_warehouse_role(p_warehouse_id uuid, p_roles public.member_role[])
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  select private.is_active_user() and exists (
    select 1 from public.warehouse_members wm
    where wm.warehouse_id = p_warehouse_id and wm.user_id = (select auth.uid()) and wm.role = any(p_roles)
  );
$function$;

CREATE OR REPLACE FUNCTION private.is_reporter(p_warehouse_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  select private.has_warehouse_role(p_warehouse_id, array['operations','hvac_engineer','warehouse_admin']::public.member_role[]);
$function$;

CREATE OR REPLACE FUNCTION private.is_resolver(p_warehouse_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  select private.has_warehouse_role(p_warehouse_id, array['program_manager_infra','pmc','pmo']::public.member_role[]);
$function$;

-- public schema — RPCs and triggers

CREATE OR REPLACE FUNCTION public.raise_snag(
  p_warehouse_id uuid, p_description text, p_category snag_category, p_sub_category snag_sub_category,
  p_location snag_location, p_scope snag_scope, p_severity snag_severity,
  p_sub_category_other text DEFAULT NULL, p_id uuid DEFAULT NULL, p_suppressed_duplicate_ids uuid[] DEFAULT NULL
) RETURNS snags LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_serial integer;
  v_row public.snags;
  v_dup_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not (private.is_reporter(p_warehouse_id) or private.is_dashboard_admin()) then
    raise exception 'not a reporter on this warehouse';
  end if;
  if p_sub_category = 'others' and (p_sub_category_other is null or length(trim(p_sub_category_other)) = 0) then
    raise exception 'sub_category_other is required when sub_category is others';
  end if;

  update public.warehouses set snag_counter = snag_counter + 1 where id = p_warehouse_id
    returning snag_counter into v_serial;
  if v_serial is null then raise exception 'warehouse not found'; end if;

  insert into public.snags (id, warehouse_id, serial_no, raised_by, description, category,
    sub_category, sub_category_other, location, scope, severity)
  values (coalesce(p_id, extensions.gen_random_uuid()), p_warehouse_id, v_serial, v_uid, p_description,
    p_category, p_sub_category, p_sub_category_other, p_location, p_scope, p_severity)
  returning * into v_row;

  insert into public.snag_activity (snag_id, actor_id, action) values (v_row.id, v_uid, 'raise');

  if p_suppressed_duplicate_ids is not null then
    foreach v_dup_id in array p_suppressed_duplicate_ids loop
      insert into public.snag_activity (snag_id, actor_id, action, field, new_value)
      values (v_row.id, v_uid, 'duplicate_suppressed', 'duplicate_of', v_dup_id::text);
    end loop;
  end if;
  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.post_snag_update(
  p_snag_id uuid, p_body text, p_etc_date date DEFAULT NULL, p_status snag_status DEFAULT NULL,
  p_acting_as text DEFAULT 'resolver'
) RETURNS snag_updates LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_warehouse_id uuid; v_row public.snag_updates; v_old_status public.snag_status; v_old_etc date;
  v_side public.snag_update_side;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_acting_as not in ('reporter', 'resolver') then raise exception 'p_acting_as must be reporter or resolver'; end if;

  select warehouse_id, status, etc_date into v_warehouse_id, v_old_status, v_old_etc
  from public.snags where id = p_snag_id;
  if v_warehouse_id is null then raise exception 'snag not found'; end if;

  if p_acting_as = 'reporter' then
    if not (private.is_reporter(v_warehouse_id) or private.is_dashboard_admin()) then
      raise exception 'not a reporter on this warehouse';
    end if;
    if p_etc_date is not null or p_status is not null then raise exception 'reporters may not set ETC or status'; end if;
    v_side := case when private.is_reporter(v_warehouse_id) then 'reporter' else 'admin' end;
  else
    if not (private.is_resolver(v_warehouse_id) or private.is_dashboard_admin()) then
      raise exception 'not a resolver on this warehouse';
    end if;
    if p_status is not null and p_status not in ('wip', 'ready_to_close') then
      raise exception 'resolvers may only move status to wip or ready_to_close';
    end if;
    v_side := case when private.is_resolver(v_warehouse_id) then 'resolver' else 'admin' end;
  end if;

  insert into public.snag_updates (snag_id, body, author_id, author_side)
  values (p_snag_id, p_body, v_uid, v_side) returning * into v_row;

  if p_etc_date is not null or p_status is not null then
    update public.snags set etc_date = coalesce(p_etc_date, etc_date), status = coalesce(p_status, status)
    where id = p_snag_id;
  end if;
  if p_status is not null and p_status is distinct from v_old_status then
    insert into public.snag_activity (snag_id, actor_id, action, field, old_value, new_value)
    values (p_snag_id, v_uid, 'status_change', 'status', v_old_status::text, p_status::text);
  end if;
  if p_etc_date is not null and p_etc_date is distinct from v_old_etc then
    insert into public.snag_activity (snag_id, actor_id, action, field, old_value, new_value)
    values (p_snag_id, v_uid, 'etc_update', 'etc_date', v_old_etc::text, p_etc_date::text);
  end if;
  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.close_snag_directly(p_snag_id uuid, p_body text DEFAULT NULL)
 RETURNS snag_action_result LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_warehouse_id uuid; v_old_status public.snag_status; v_row public.snags; v_update_id uuid;
  v_side public.snag_update_side; v_result public.snag_action_result;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select warehouse_id, status into v_warehouse_id, v_old_status from public.snags where id = p_snag_id;
  if v_warehouse_id is null then raise exception 'snag not found'; end if;
  if not (private.is_reporter(v_warehouse_id) or private.is_dashboard_admin()) then
    raise exception 'not a reporter on this warehouse';
  end if;
  if v_old_status = 'closed' then raise exception 'snag is already closed'; end if;

  update public.snags set status = 'closed', closed_at = now(), verified_by = v_uid, verified_at = now()
    where id = p_snag_id returning * into v_row;
  insert into public.snag_activity (snag_id, actor_id, action, field, old_value, new_value)
  values (p_snag_id, v_uid, 'verify_closure', 'status', v_old_status::text, 'closed');

  if p_body is not null and length(trim(p_body)) > 0 then
    v_side := case when private.is_reporter(v_warehouse_id) then 'reporter' else 'admin' end;
    insert into public.snag_updates (snag_id, body, author_id, author_side)
    values (p_snag_id, p_body, v_uid, v_side) returning id into v_update_id;
  end if;
  v_result.snag := v_row; v_result.update_id := v_update_id;
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.verify_snag_closure(p_snag_id uuid, p_approved boolean, p_body text DEFAULT NULL)
 RETURNS snag_action_result LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_warehouse_id uuid; v_old_status public.snag_status; v_row public.snags; v_update_id uuid;
  v_side public.snag_update_side; v_result public.snag_action_result;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select warehouse_id, status into v_warehouse_id, v_old_status from public.snags where id = p_snag_id;
  if v_warehouse_id is null then raise exception 'snag not found'; end if;
  if not (private.is_reporter(v_warehouse_id) or private.is_dashboard_admin()) then
    raise exception 'not a reporter on this warehouse';
  end if;
  if v_old_status <> 'ready_to_close' then raise exception 'snag is not awaiting verification'; end if;

  if p_approved then
    update public.snags set status = 'closed', closed_at = now(), verified_by = v_uid, verified_at = now()
      where id = p_snag_id returning * into v_row;
    insert into public.snag_activity (snag_id, actor_id, action, field, old_value, new_value)
    values (p_snag_id, v_uid, 'verify_closure', 'status', 'ready_to_close', 'closed');
  else
    update public.snags set status = 'wip' where id = p_snag_id returning * into v_row;
    insert into public.snag_activity (snag_id, actor_id, action, field, old_value, new_value)
    values (p_snag_id, v_uid, 'reject_closure', 'status', 'ready_to_close', 'wip');
  end if;

  if p_body is not null and length(trim(p_body)) > 0 then
    v_side := case when private.is_reporter(v_warehouse_id) then 'reporter' else 'admin' end;
    insert into public.snag_updates (snag_id, body, author_id, author_side)
    values (p_snag_id, p_body, v_uid, v_side) returning id into v_update_id;
  end if;
  v_result.snag := v_row; v_result.update_id := v_update_id;
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.correct_date_raised(p_snag_id uuid, p_new_date date)
 RETURNS snags LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_uid uuid := (select auth.uid()); v_old_date date; v_row public.snags;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not private.is_dashboard_admin() then raise exception 'only a dashboard admin may correct date_raised'; end if;
  select date_raised into v_old_date from public.snags where id = p_snag_id;
  if v_old_date is null then raise exception 'snag not found'; end if;
  update public.snags set date_raised = p_new_date where id = p_snag_id returning * into v_row;
  insert into public.snag_activity (snag_id, actor_id, action, field, old_value, new_value)
  values (p_snag_id, v_uid, 'correct_date_raised', 'date_raised', v_old_date::text, p_new_date::text);
  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.find_similar_snags(
  p_warehouse_id uuid, p_location snag_location, p_sub_category snag_sub_category, p_description text,
  p_threshold real DEFAULT 0.3
) RETURNS TABLE(id uuid, serial_no integer, description text, status snag_status, raised_by_name text, similarity real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  select s.id, s.serial_no, s.description, s.status, coalesce(p.full_name, p.email) as raised_by_name,
         extensions.similarity(s.description, p_description) as similarity
  from public.snags s left join public.profiles p on p.id = s.raised_by
  where s.warehouse_id = p_warehouse_id and s.location = p_location and s.sub_category = p_sub_category
    and s.status <> 'closed' and extensions.similarity(s.description, p_description) > p_threshold
  order by similarity desc limit 10;
$function$;

CREATE OR REPLACE FUNCTION public.set_go_live_date(p_warehouse_id uuid, p_date date)
 RETURNS warehouses LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_uid uuid := (select auth.uid()); v_row public.warehouses; v_old_date date;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not (private.is_resolver(p_warehouse_id) or private.is_dashboard_admin()) then
    raise exception 'not a resolver on this warehouse';
  end if;
  select go_live_date into v_old_date from public.warehouses where id = p_warehouse_id;
  update public.warehouses set go_live_date = p_date where id = p_warehouse_id returning * into v_row;
  if v_row.id is null then raise exception 'warehouse not found'; end if;
  insert into public.warehouse_activity (warehouse_id, actor_id, action, field, old_value, new_value)
  values (p_warehouse_id, v_uid, 'go_live_date_change', 'go_live_date', v_old_date::text, p_date::text);
  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_user_active(p_user_id uuid, p_is_active boolean)
 RETURNS profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_uid uuid := (select auth.uid()); v_row public.profiles;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not private.is_dashboard_admin() then raise exception 'only a dashboard admin may change account status'; end if;
  if not p_is_active and p_user_id = v_uid then raise exception 'you cannot deactivate your own account'; end if;
  update public.profiles set is_active = p_is_active where id = p_user_id returning * into v_row;
  if v_row.id is null then raise exception 'user not found'; end if;
  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_dashboard_admin(p_user_id uuid, p_is_admin boolean)
 RETURNS profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_uid uuid := (select auth.uid()); v_row public.profiles;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not private.is_dashboard_admin() then raise exception 'only a dashboard admin may change dashboard admin status'; end if;
  update public.profiles set is_dashboard_admin = p_is_admin where id = p_user_id returning * into v_row;
  if v_row.id is null then raise exception 'user not found'; end if;
  return v_row;
end;
$function$;
-- No frontend caller today (§4) — admin status can only be granted at invite time.

CREATE OR REPLACE FUNCTION public.create_warehouse(p_name text, p_site_location text, p_members jsonb)
 RETURNS warehouses LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_uid uuid := (select auth.uid()); v_row public.warehouses; m record;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not private.is_dashboard_admin() then raise exception 'only a dashboard admin may create a warehouse'; end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'warehouse name is required'; end if;
  insert into public.warehouses (name, site_location, created_by)
  values (trim(p_name), nullif(trim(coalesce(p_site_location, '')), ''), v_uid) returning * into v_row;
  for m in select * from jsonb_to_recordset(p_members) as x(user_id uuid, role public.member_role) loop
    insert into public.warehouse_members (warehouse_id, user_id, role) values (v_row.id, m.user_id, m.role)
    on conflict (warehouse_id, user_id, role) do nothing;
  end loop;
  return v_row;
end;
$function$;
-- No frontend caller today (§5.4–5.5) — createWarehouseCode does a plain insert instead.

CREATE OR REPLACE FUNCTION public.refresh_snag_daily_snapshot()
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $function$
  insert into public.snag_daily_snapshot (warehouse_id, snapshot_date, total_raised, total_closed, open_count, open_high_count)
  select s.warehouse_id, current_date, count(*)::int, count(*) filter (where s.status = 'closed')::int,
         count(*) filter (where s.status <> 'closed')::int,
         count(*) filter (where s.status <> 'closed' and s.severity = 'high')::int
  from public.snags s group by s.warehouse_id
  on conflict (warehouse_id, snapshot_date) do update set
    total_raised = excluded.total_raised, total_closed = excluded.total_closed,
    open_count = excluded.open_count, open_high_count = excluded.open_high_count;
$function$;
-- No authenticated/anon grant — only postgres/service_role can call it; pg_cron is the only caller (§12.1).

-- Triggers (§15.5)
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $function$
begin new.updated_at = now(); return new; end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_invite public.invitations; v_warehouse_id uuid;
begin
  select * into v_invite from public.invitations where email = new.email;
  if v_invite.id is null then raise exception 'no invitation found for %', new.email; end if;
  insert into public.profiles (id, email, full_name, is_dashboard_admin, default_role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email),
          v_invite.grant_dashboard_admin, v_invite.default_role);
  if v_invite.warehouse_ids is not null then
    foreach v_warehouse_id in array v_invite.warehouse_ids loop
      insert into public.warehouse_members (warehouse_id, user_id, role)
      values (v_warehouse_id, new.id, v_invite.default_role) on conflict do nothing;
    end loop;
  end if;
  update public.invitations set accepted_at = now() where id = v_invite.id;
  return new;
end;
$function$;
```

### 15.5 Triggers

```sql
create trigger snags_set_updated_at before update on public.snags
  for each row execute function public.set_updated_at();

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
```

### 15.6 RLS policies

Every policy in the schema, grouped by table. `alter table ... enable row level security;` on all of them.

```sql
-- profiles — fully open read (§3.1), no write policy needed (writes go through
-- handle_new_user/set_user_active/set_dashboard_admin, all SECURITY DEFINER)
create policy profiles_select_all on public.profiles for select
  using (true);

-- invitations — admin table (§4.1), plain RLS not RPC
create policy invitations_select_admin on public.invitations for select
  using ((select private.is_dashboard_admin()));
create policy invitations_insert_admin on public.invitations for insert
  with check ((select private.is_dashboard_admin()));
create policy invitations_update_admin on public.invitations for update
  using ((select private.is_dashboard_admin())) with check ((select private.is_dashboard_admin()));

-- warehouses — admin table
create policy warehouses_select_scoped on public.warehouses for select
  using (private.is_dashboard_admin() or private.is_warehouse_member(id));
create policy warehouses_insert_admin on public.warehouses for insert
  with check ((select private.is_dashboard_admin()));
create policy warehouses_update_admin on public.warehouses for update
  using ((select private.is_dashboard_admin())) with check ((select private.is_dashboard_admin()));
create policy warehouses_delete_admin on public.warehouses for delete
  using (private.is_dashboard_admin());

-- warehouse_members — admin table
create policy warehouse_members_select_scoped on public.warehouse_members for select
  using (private.is_dashboard_admin() or private.is_warehouse_member(warehouse_id));
create policy warehouse_members_insert_admin on public.warehouse_members for insert
  with check ((select private.is_dashboard_admin()));
create policy warehouse_members_delete_admin on public.warehouse_members for delete
  using ((select private.is_dashboard_admin()));

-- warehouse_activity — admin-only insert (§3.4a), scoped read (widened 18 Aug 2026)
create policy warehouse_activity_select_scoped on public.warehouse_activity for select
  using (private.is_dashboard_admin() or private.is_warehouse_member(warehouse_id));
create policy warehouse_activity_insert_admin on public.warehouse_activity for insert
  with check (private.is_dashboard_admin());

-- people_activity — admin-only both ways (§3.4b)
create policy people_activity_select_admin on public.people_activity for select
  using (private.is_dashboard_admin());
create policy people_activity_insert_admin on public.people_activity for insert
  with check (private.is_dashboard_admin());

-- snags, snag_updates, snag_activity, snag_daily_snapshot — read-scoped only;
-- all writes go through the RPCs in §15.4, which are SECURITY DEFINER and
-- bypass these policies entirely for their own inserts/updates
create policy snags_select_scoped on public.snags for select
  using (private.is_dashboard_admin() or private.is_warehouse_member(warehouse_id));
create policy snag_updates_select_scoped on public.snag_updates for select
  using (private.is_dashboard_admin() or exists (
    select 1 from public.snags s where s.id = snag_updates.snag_id and private.is_warehouse_member(s.warehouse_id)
  ));
create policy snag_activity_select_scoped on public.snag_activity for select
  using (private.is_dashboard_admin() or exists (
    select 1 from public.snags s where s.id = snag_activity.snag_id and private.is_warehouse_member(s.warehouse_id)
  ));
create policy snag_daily_snapshot_select_scoped on public.snag_daily_snapshot for select
  using (private.is_dashboard_admin() or private.is_warehouse_member(warehouse_id));

-- attachments — insert allowed for reporters/resolvers directly (not RPC-gated,
-- §6), since photo/video upload is a plain client insert against this table
create policy attachments_select_scoped on public.attachments for select
  using (private.is_dashboard_admin() or exists (
    select 1 from public.snags s where s.id = attachments.snag_id and private.is_warehouse_member(s.warehouse_id)
  ));
create policy attachments_insert_members on public.attachments for insert
  with check (private.is_dashboard_admin() or exists (
    select 1 from public.snags s
    where s.id = attachments.snag_id and (private.is_reporter(s.warehouse_id) or private.is_resolver(s.warehouse_id))
  ));

-- storage.objects, bucket_id = 'attachments' — path is {warehouse_id}/{snag_id}/{...} (§6)
create policy attachments_bucket_select_all on storage.objects for select
  using (bucket_id = 'attachments');
create policy attachments_bucket_insert_members on storage.objects for insert
  with check (
    bucket_id = 'attachments' and (
      private.is_dashboard_admin()
      or private.is_reporter((storage.foldername(name))[1]::uuid)
      or private.is_resolver((storage.foldername(name))[1]::uuid)
    )
  );
```

### 15.7 Function grants

Verified via `aclexplode(proacl)` on 18 Aug 2026 — the detail CLAUDE.md's `CREATE OR REPLACE` gotcha warns is easy to lose track of when a function's parameter count changes.

| Function | Grantees |
|---|---|
| `raise_snag`, `post_snag_update`, `close_snag_directly`, `verify_snag_closure`, `correct_date_raised`, `find_similar_snags`, `set_go_live_date`, `set_user_active`, `set_dashboard_admin`, `create_warehouse` | `authenticated` only (plus `postgres`/`service_role`, always present, not app-relevant) — **`anon` explicitly not granted** on any of these |
| `handle_new_user`, `refresh_snag_daily_snapshot` | `postgres`/`service_role` only — not callable by `authenticated` or `anon` at all. `handle_new_user` only ever runs as the `on_auth_user_created` trigger; `refresh_snag_daily_snapshot` only ever runs as the `pg_cron` job (§12.1) |

Confirmed via `pg_get_function_identity_arguments` that `close_snag_directly`, `post_snag_update`, and `verify_snag_closure` — the three CLAUDE.md's gotcha names as the ones widened with a new trailing parameter — each have exactly **one** signature live today, not two. The old overload the gotcha warns about does not currently exist; if one ever reappears after a future signature change, that's the bug the gotcha describes.

---

## 16. Complete application source code — every file, verbatim

This is the literal, final layer: every application source file and root config file in the repository, exactly as it exists on disk on 1 Sept 2026, in full. Everything above this section describes the app in prose, tables, and targeted exact-copy references; this section removes any remaining ambiguity by including the actual source. Generated files (`package-lock.json`, `next-env.d.ts`, `tsconfig.tsbuildinfo`, `.next/`), secrets (`.env.local`), and OS/editor artifacts (`.DS_Store`) are excluded — everything else that is authored, version-controllable project source is here. If this section and the prose sections ever disagree after a future code change, **this section is stale, not wrong-by-design** — regenerate it from the live repository the same way it was built.

### 16.1 Root configuration

#### `next.config.ts`

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
```

#### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules"]
}
```

#### `postcss.config.mjs`

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

#### `eslint.config.mjs`

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
```

#### `components.json`

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "base-nova",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "rtl": false,
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "menuColor": "default",
  "menuAccent": "subtle",
  "registries": {}
}
```

#### `package.json`

```json
{
  "name": "snag-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint"
  },
  "dependencies": {
    "@base-ui/react": "^1.7.0",
    "@supabase/ssr": "^0.12.4",
    "@supabase/supabase-js": "^2.112.2",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "exceljs": "^4.4.0",
    "lucide-react": "^1.30.0",
    "next": "16.3.0",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "shadcn": "^4.16.2",
    "tailwind-merge": "^3.6.0",
    "tw-animate-css": "^1.4.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.3.0",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

#### `.gitignore`

```
# See https://help.github.com/articles/ignoring-files/ for more about ignoring files.

# dependencies
/node_modules
/.pnp
.pnp.*
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/versions

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# env files (can opt-in for committing if needed)
.env*

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts
```

### 16.2 Global styles

#### `src/app/globals.css`

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-body);
  --font-mono: var(--font-data);
  --font-heading: var(--font-display);
  --color-ground: var(--ground);
  --color-surface: var(--surface);
  --color-line: var(--line);
  --color-line-soft: var(--line-soft);
  --color-blush: var(--blush);
  --color-coral: var(--coral);
  --color-red: var(--red);
  --color-red-deep: var(--red-deep);
  --color-frost: var(--frost);
  --color-teal: var(--teal);
  --color-teal-deep: var(--teal-deep);
  --color-sky: var(--sky);
  --color-mint: var(--mint);
  --color-mint-deep: var(--mint-deep);
  --color-amber: var(--amber);
  --color-amber-deep: var(--amber-deep);
  --color-faint: var(--faint);
  --radius-card: 0.875rem;
  --radius-pill: 1.25rem;
  --radius-chip: 0.25rem;
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}

:root {
  /* Frozen Warehouse Launch Readiness — thermal gradient palette, see DESIGN.md */
  --ground: #FFF9F7;
  --surface: #FFFFFF;
  --line: #E0C0B0;
  --line-soft: #F7EAE6;
  --blush: #FBE4DE;
  --coral: #E89484;
  --red: #C75B4E;
  --red-deep: #8C3A31;
  --frost: #DCEAEE;
  --teal: #6E9CA6;
  --teal-deep: #28505E;
  --sky: #E2ECF2;
  --mint: #E4EFE9;
  --mint-deep: #2C5142;
  --amber: #F7EAD8;
  --amber-deep: #7A4A12;
  --ink: #2E2422;
  --faint: #6B5A54;

  --background: var(--ground);
  --foreground: var(--ink);
  --card: var(--surface);
  --card-foreground: var(--ink);
  --popover: var(--surface);
  --popover-foreground: var(--ink);
  --primary: var(--red);
  --primary-foreground: var(--ground);
  --secondary: var(--surface);
  --secondary-foreground: var(--ink);
  --muted: var(--line-soft);
  --muted-foreground: #5C4F4B;
  --accent: var(--blush);
  --accent-foreground: var(--red-deep);
  --destructive: var(--red);
  --border: var(--line);
  --input: var(--line);
  --ring: var(--red);
  --chart-1: var(--red);
  --chart-2: var(--teal);
  --chart-3: var(--coral);
  --chart-4: var(--frost);
  --chart-5: var(--amber);
  --radius: 0.5rem;
  --sidebar: var(--surface);
  --sidebar-foreground: var(--ink);
  --sidebar-primary: var(--red);
  --sidebar-primary-foreground: var(--ground);
  --sidebar-accent: var(--blush);
  --sidebar-accent-foreground: var(--red-deep);
  --sidebar-border: var(--line);
  --sidebar-ring: var(--red);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans;
  }
  h1, h2, h3 {
    @apply font-heading tracking-[-0.015em];
    font-weight: 700;
  }
}
```

### 16.3 Application source — `src/`, every `.ts`/`.tsx` file

#### `src/app/(app)/about/page.tsx`

```tsx
import { ROLE_COLOR_CLASS, roleLabel } from "@/lib/roles";

const REPORTER_ROLE_VALUES = ["hvac_engineer", "operations", "warehouse_admin"];
const RESOLVER_ROLE_VALUES = ["program_manager_infra", "pmc", "pmo"];

function RoleChips({ values }: { values: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => (
        <span key={v} className={`rounded-pill border px-2 py-0.5 text-[11px] ${ROLE_COLOR_CLASS[v]}`}>
          {roleLabel(v)}
        </span>
      ))}
    </div>
  );
}

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-screen-md px-4 py-6 sm:px-6 sm:py-8 lg:px-[50px]">
      <h1 className="mb-2 text-[17px] font-medium tracking-[-0.015em] text-foreground">About this dashboard</h1>
      <p className="mb-6 text-[13px] leading-relaxed text-muted-foreground">
        Frozen Warehouse Launch Readiness tracks defects — snags — found while a cold-storage warehouse is being
        built and commissioned, so nothing blocks opening day by surprise. Everyone can see what&apos;s still open
        across a warehouse; the two roles below are the people who raise issues and the people who close them.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-card border border-border bg-card p-4">
          <div className="mb-1 text-[14px] font-medium text-foreground">Reporters</div>
          <p className="mb-3 text-[12px] text-muted-foreground">Raise what they find on the floor.</p>
          <div className="mb-3">
            <RoleChips values={REPORTER_ROLE_VALUES} />
          </div>
          <ul className="flex flex-col gap-2 text-[12.5px] text-foreground">
            <li>
              Raise a new snag — description, category, sub-category, location, scope, severity, and photos.
            </li>
            <li>Comment on any snag raised on a warehouse they&apos;re tagged to.</li>
            <li>Close a ticket directly at any time.</li>
            <li>Confirm or reject a snag once a resolver has marked it ready to close.</li>
          </ul>
        </div>

        <div className="rounded-card border border-border bg-card p-4">
          <div className="mb-1 text-[14px] font-medium text-foreground">Resolvers</div>
          <p className="mb-3 text-[12px] text-muted-foreground">Drive each snag to close.</p>
          <div className="mb-3">
            <RoleChips values={RESOLVER_ROLE_VALUES} />
          </div>
          <ul className="flex flex-col gap-2 text-[12.5px] text-foreground">
            <li>Comment on a snag, with photos or video.</li>
            <li>Set an ETC for when the fix will be done.</li>
            <li>Move a snag to WIP, or mark it ready to close for the reporter to verify.</li>
            <li>Set a warehouse&apos;s go-live date.</li>
          </ul>
        </div>
      </div>

      <p className="mt-6 text-[11.5px] text-faint">
        A person holds one role — Reporter or Resolver — the same on every warehouse they&apos;re tagged to.
      </p>
    </div>
  );
}
```

#### `src/app/(app)/actions.ts`

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

#### `src/app/(app)/admin/users/actions.ts`

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/lib/roles";
import { DASHBOARD_ADMIN_VALUE, roleLabel } from "@/lib/roles";

export async function createInvitation(formData: FormData) {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const role = formData.get("role") as string;

  if (!email || !role) {
    return { error: "Email and a role are required." };
  }

  // Dashboard Admin is mutually exclusive with an operational role here —
  // picking it means no default_role and no warehouse tagging, since
  // admin's powers are global, not warehouse-scoped (PLAN.md §2.2).
  const isAdminPick = role === DASHBOARD_ADMIN_VALUE;
  const defaultRole = isAdminPick ? null : (role as MemberRole);
  const grantDashboardAdmin = isAdminPick;
  const warehouseIds = isAdminPick ? [] : (formData.getAll("warehouse_ids") as string[]);

  const supabase = await createClient();

  // handle_new_user() only ever runs on someone's first sign-in — once
  // they have a profile, editing this invitation has no effect on their
  // real access. Say so instead of silently upserting a value that will
  // never take effect.
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingProfile) {
    return {
      error:
        "This person has already signed in, so their role, warehouse, and admin status can't be changed here — there's currently no way to edit an existing member's access.",
    };
  }

  const { data: auth } = await supabase.auth.getClaims();
  const invitedBy = auth?.claims?.sub;

  const { error } = await supabase.from("invitations").upsert(
    {
      email,
      default_role: defaultRole,
      grant_dashboard_admin: grantDashboardAdmin,
      warehouse_ids: warehouseIds,
      invited_by: invitedBy,
    },
    { onConflict: "email" }
  );

  if (error) {
    return { error: error.message };
  }

  let detail = isAdminPick ? "Invited as Dashboard Admin" : `Invited as ${roleLabel(defaultRole)}`;
  if (warehouseIds.length > 0) {
    const { data: whs } = await supabase.from("warehouses").select("name").in("id", warehouseIds);
    const names = (whs ?? []).map((w) => w.name);
    if (names.length > 0) detail += `, tagged to ${names.join(", ")}`;
  }
  await supabase.from("people_activity").insert({ email, actor_id: invitedBy, action: "invited", detail });

  revalidatePath("/admin/users");
  return { error: null };
}

// Adds warehouse_members rows for someone who has already signed in — the
// gap CLAUDE.md documents (handle_new_user only runs on first sign-in, so
// re-inviting has no effect on real access). A person holds exactly one
// role, full stop — not chosen here, but read from profiles.default_role
// (set once at invite time and otherwise unused as anything but a sort
// hint elsewhere, but authoritative for this control). Every call
// re-derives the person's *entire* warehouse_members set from their
// current + newly-picked warehouses, all under that one role, so this
// also self-heals anyone left holding two different roles by an earlier
// version of this action that let the caller pass a role per call. Still
// can't remove a warehouse entirely or touch admin status — see the
// "no way to edit an existing member" gotcha.
export async function addWarehouseMembership(userId: string, newWarehouseIds: string[]) {
  if (newWarehouseIds.length === 0) {
    return { error: "Pick at least one warehouse." };
  }

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("default_role, email")
    .eq("id", userId)
    .maybeSingle();
  const role = profile?.default_role as MemberRole | null;

  if (!role) {
    return { error: "This person has no role on file, so they can't be tagged to a warehouse here." };
  }

  const { data: existingRows, error: readError } = await supabase
    .from("warehouse_members")
    .select("warehouse_id")
    .eq("user_id", userId);

  if (readError) {
    return { error: readError.message };
  }

  const warehouseIds = Array.from(
    new Set([...(existingRows ?? []).map((r) => r.warehouse_id), ...newWarehouseIds])
  );

  const { error: deleteError } = await supabase
    .from("warehouse_members")
    .delete()
    .eq("user_id", userId);

  if (deleteError) {
    return { error: deleteError.message };
  }

  const rows = warehouseIds.map((warehouse_id) => ({ warehouse_id, user_id: userId, role }));
  const { error } = await supabase.from("warehouse_members").insert(rows);

  if (error) {
    return { error: error.message };
  }

  if (profile?.email) {
    const { data: auth } = await supabase.auth.getClaims();
    const { data: newWhs } = await supabase.from("warehouses").select("name").in("id", newWarehouseIds);
    const names = (newWhs ?? []).map((w) => w.name).join(", ");
    await supabase.from("people_activity").insert({
      email: profile.email,
      actor_id: auth?.claims?.sub,
      action: "warehouse_added",
      detail: `Tagged to ${names}`,
    });
  }

  revalidatePath("/admin/users");
  return { error: null };
}

export async function setUserActive(userId: string, isActive: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_user_active", {
    p_user_id: userId,
    p_is_active: isActive,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/users");
  return { error: null };
}
```

#### `src/app/(app)/admin/users/add-warehouse-control.tsx`

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { MultiSelectFilter } from "@/components/multi-select-filter";
import { addWarehouseMembership } from "./actions";

type Warehouse = { id: string; name: string };

export function AddWarehouseControl({
  userId,
  warehouses,
}: {
  userId: string;
  warehouses: Warehouse[];
}) {
  const [open, setOpen] = useState(false);
  const [warehouseIds, setWarehouseIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setOpen(false);
    setWarehouseIds([]);
    setError(null);
  }

  function submit() {
    if (warehouseIds.length === 0) {
      setError("Pick at least one warehouse.");
      return;
    }
    startTransition(async () => {
      const result = await addWarehouseMembership(userId, warehouseIds);
      if (result.error) {
        setError(result.error);
        return;
      }
      reset();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-0.5 text-[11px] text-primary hover:underline"
      >
        + Add warehouse
      </button>
    );
  }

  // Nothing left to offer — say so instead of showing a picker that opens
  // onto an empty, confusing dropdown.
  if (warehouses.length === 0) {
    return (
      <div className="mt-1 flex items-center gap-1.5">
        <p className="text-[11px] text-faint">All warehouses added</p>
        <Button type="button" variant="outline" size="sm" onClick={reset}>
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-1 flex flex-col items-start gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {/* No role picker — a person holds exactly one role, set at invite
            time (profiles.default_role); this control only adds warehouse
            tags under that existing role. */}
        <MultiSelectFilter
          label="Warehouse"
          emptySuffix=""
          options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
          selected={warehouseIds}
          onChange={setWarehouseIds}
          onSelectAll={() => setWarehouseIds(warehouses.map((w) => w.id))}
        />

        <Button type="button" size="sm" disabled={pending || warehouseIds.length === 0} onClick={submit}>
          {pending ? "Adding…" : "Add"}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={reset}>
          Cancel
        </Button>
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
```

#### `src/app/(app)/admin/users/invite-form.tsx`

```tsx
"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiSelectFilter } from "@/components/multi-select-filter";
import { INVITE_ROLE_OPTIONS, DASHBOARD_ADMIN_VALUE, roleLabel } from "@/lib/roles";
import { createInvitation } from "./actions";

type State = { error: string | null; success: boolean };
type Warehouse = { id: string; name: string };

export function InviteForm({ warehouses }: { warehouses: Warehouse[] }) {
  const [formKey, setFormKey] = useState(0);
  const [warehouseIds, setWarehouseIds] = useState<string[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const isAdminPick = role === DASHBOARD_ADMIN_VALUE;

  const [state, formAction, pending] = useActionState<State, FormData>(
    async (_prev, formData) => {
      const result = await createInvitation(formData);
      if (result.error) return { error: result.error, success: false };
      // Role (base-ui Select) and the Warehouse multi-select manage their
      // own state — a native form reset after the action doesn't reach
      // them, so force a full remount to clear everything rather than
      // leaving the last invite's values sitting there.
      setWarehouseIds([]);
      setRole(null);
      setFormKey((k) => k + 1);
      return { error: null, success: true };
    },
    { error: null, success: false }
  );

  return (
    <form key={formKey} action={formAction} className="mb-5">
      <h2 className="mb-2 text-[14px] font-medium text-foreground">Invite people</h2>
      <div className="flex flex-wrap items-center gap-2">
        <Input name="email" type="email" placeholder="name@company.com" required className="w-60" />

        <Select name="role" required onValueChange={(v) => setRole(v as string)}>
          <SelectTrigger className="w-56">
            <SelectValue>
              {(value: string | null) => (value ? roleLabel(value) : "Role")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {INVITE_ROLE_OPTIONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!isAdminPick && (
          <>
            <MultiSelectFilter
              label="Warehouse"
              emptySuffix=""
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
              selected={warehouseIds}
              onChange={setWarehouseIds}
              onSelectAll={() => setWarehouseIds(warehouses.map((w) => w.id))}
              className="w-56"
            />
            {warehouseIds.map((id) => (
              <input key={id} type="hidden" name="warehouse_ids" value={id} />
            ))}
          </>
        )}

        <Button type="submit" disabled={pending} className="w-56">
          {pending ? "Sending…" : "Send invite"}
        </Button>
      </div>
      {state.error && <p className="mt-2 text-[12.5px] text-destructive">{state.error}</p>}
      {state.success && <p className="mt-2 text-[12.5px] text-mint-deep">Invite sent.</p>}
    </form>
  );
}
```

#### `src/app/(app)/admin/users/page.tsx`

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { roleLabel } from "@/lib/roles";
import { InviteForm } from "./invite-form";
import { PersonRow, type PersonActivityRow } from "./person-row";

type Row = {
  key: string;
  name: string;
  role: string;
  warehouseNames: string[];
  status: "active" | "invited" | "deactivated";
  userId: string | null;
  isDashboardAdmin: boolean;
};

export default async function UserManagementPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;

  const { data: me } = await supabase
    .from("profiles")
    .select("is_dashboard_admin")
    .eq("id", uid)
    .single();

  if (!me?.is_dashboard_admin) {
    redirect("/");
  }

  const [{ data: invitations }, { data: profiles }, { data: warehouses }, { data: memberships }, { data: activity }] =
    await Promise.all([
      supabase
        .from("invitations")
        .select("email, default_role, accepted_at, grant_dashboard_admin, warehouse_ids")
        .order("created_at"),
      supabase.from("profiles").select("id, email, full_name, is_active, is_dashboard_admin"),
      supabase.from("warehouses").select("id, name, is_active").order("name"),
      supabase.from("warehouse_members").select("user_id, warehouse_id, role, warehouse:warehouses(name)"),
      supabase
        .from("people_activity")
        .select("id, email, action, detail, created_at, actor:profiles(full_name, email)")
        .order("created_at", { ascending: false }),
    ]);

  const activityByEmail: Record<string, PersonActivityRow[]> = {};
  for (const a of activity ?? []) {
    const key = (a as { email: string }).email;
    (activityByEmail[key] ??= []).push(a as unknown as PersonActivityRow);
  }

  const activeWarehouses = (warehouses ?? []).filter((w) => w.is_active);
  const warehouseNameById = new Map((warehouses ?? []).map((w) => [w.id, w.name]));
  const profileByEmail = new Map((profiles ?? []).map((p) => [p.email, p]));

  const membershipsByUser = new Map<string, Set<string>>();
  const warehouseIdsByUser = new Map<string, Set<string>>();
  const rolesByUser = new Map<string, Set<string>>();
  for (const m of memberships ?? []) {
    const warehouseName = (m.warehouse as unknown as { name: string } | null)?.name;
    if (!warehouseName) continue;
    // A person can hold more than one role on the same warehouse (two
    // warehouse_members rows) — this column doesn't show roles, so the
    // warehouse name itself should only ever appear once per person.
    if (!membershipsByUser.has(m.user_id)) membershipsByUser.set(m.user_id, new Set());
    membershipsByUser.get(m.user_id)!.add(warehouseName);
    if (!warehouseIdsByUser.has(m.user_id)) warehouseIdsByUser.set(m.user_id, new Set());
    warehouseIdsByUser.get(m.user_id)!.add(m.warehouse_id);
    if (!rolesByUser.has(m.user_id)) rolesByUser.set(m.user_id, new Set());
    rolesByUser.get(m.user_id)!.add(m.role);
  }

  const rows: Row[] = (invitations ?? []).map((inv) => {
    const profile = profileByEmail.get(inv.email);
    const invitedWarehouseNames = (inv.warehouse_ids ?? [])
      .map((id: string) => warehouseNameById.get(id))
      .filter((n: string | undefined): n is string => Boolean(n));
    // Dashboard Admin is folded into this same column rather than shown
    // separately — once someone has signed in, default_role on the
    // invitation is no longer authoritative (PLAN.md §3.1), so an accepted
    // profile shows its real is_dashboard_admin flag plus real
    // warehouse_members role(s); a pending invitation has no real
    // membership yet, so it falls back to what was invited.
    const isDashboardAdmin = profile ? profile.is_dashboard_admin : inv.grant_dashboard_admin;
    const roleText = profile
      ? [
          ...(isDashboardAdmin ? ["Dashboard Admin"] : []),
          ...[...(rolesByUser.get(profile.id) ?? [])].map(roleLabel),
        ].join(", ") || "—"
      : isDashboardAdmin
        ? "Dashboard Admin"
        : roleLabel(inv.default_role);
    return {
      key: inv.email,
      name: profile?.full_name ?? inv.email,
      role: roleText,
      userId: profile?.id ?? null,
      isDashboardAdmin,
      status: !profile ? "invited" : profile.is_active ? "active" : "deactivated",
      // Dashboard Admin reads (and now writes) every warehouse regardless
      // of warehouse_members tags (PLAN.md §2.2, §2.3) — show that
      // directly instead of their real tag list (usually none) or a
      // misleading "—".
      warehouseNames: isDashboardAdmin
        ? ["All"]
        : profile
          ? [...(membershipsByUser.get(profile.id) ?? [])]
          : invitedWarehouseNames,
    };
  });

  const activeCount = rows.filter((r) => r.status === "active").length;
  const invitedCount = rows.filter((r) => r.status === "invited").length;

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 sm:py-8 lg:px-[50px]">
      <div className="mb-1 flex items-baseline justify-between">
        <h1 className="text-[17px] text-foreground">People</h1>
        <span className="text-[13px] text-muted-foreground">
          {activeCount} active · {invitedCount} invited
        </span>
      </div>
      <p className="mb-5 max-w-[60ch] text-[13px] leading-relaxed text-muted-foreground">
        Add someone&apos;s work email and the role they&apos;ll hold by default. They sign in
        with that exact address — a personal account won&apos;t match.
      </p>

      <InviteForm warehouses={activeWarehouses} />

      <p className="mb-1.5 text-[12.5px] text-muted-foreground">Click a row to see its change history.</p>

      <div className="overflow-hidden rounded-card border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Warehouse</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Change status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No one invited yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <PersonRow
                key={row.key}
                row={row}
                activity={activityByEmail[row.key] ?? []}
                addableWarehouses={activeWarehouses.filter(
                  (w) => !warehouseIdsByUser.get(row.userId ?? "")?.has(w.id)
                )}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

#### `src/app/(app)/admin/users/person-row.tsx`

```tsx
"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { StatusToggle } from "./status-toggle";
import { AddWarehouseControl } from "./add-warehouse-control";

export type PersonActivityRow = {
  id: string;
  action: string;
  detail: string | null;
  created_at: string;
  actor: { full_name: string | null; email: string } | null;
};

type Row = {
  key: string;
  name: string;
  role: string;
  warehouseNames: string[];
  status: "active" | "invited" | "deactivated";
  userId: string | null;
  isDashboardAdmin: boolean;
};

type Warehouse = { id: string; name: string };

function describeActivity(a: PersonActivityRow): string {
  return a.detail ?? a.action.replaceAll("_", " ");
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

export function PersonRow({
  row,
  activity,
  addableWarehouses,
}: {
  row: Row;
  activity: PersonActivityRow[];
  addableWarehouses: Warehouse[];
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <TableCell className="text-[13px] text-foreground">{row.name}</TableCell>
        <TableCell className="text-[13px]">{row.role}</TableCell>
        <TableCell
          className="whitespace-normal text-[12.5px] text-muted-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          {row.warehouseNames.length === 0 ? (
            <span className="block">—</span>
          ) : (
            <div className="flex flex-col gap-0.5">
              {row.warehouseNames.map((n) => (
                <span key={n}>{n}</span>
              ))}
            </div>
          )}
          {row.userId && !row.isDashboardAdmin && (
            <AddWarehouseControl userId={row.userId} warehouses={addableWarehouses} />
          )}
        </TableCell>
        <TableCell className="text-center">
          <Badge
            variant="outline"
            className={
              row.status === "active"
                ? "border-mint bg-mint text-mint-deep"
                : row.status === "invited"
                  ? "border-blush bg-blush text-red-deep"
                  : "border-line-soft bg-line-soft text-muted-foreground"
            }
          >
            {row.status === "active" ? "Active" : row.status === "invited" ? "Invited" : "Deactivated"}
          </Badge>
        </TableCell>
        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
          {row.userId && <StatusToggle userId={row.userId} isActive={row.status === "active"} />}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-background hover:bg-background">
          <TableCell colSpan={5} className="whitespace-normal p-3">
            {activity.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">No history yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {activity.map((a) => (
                  <li key={a.id} className="text-[11.5px] text-muted-foreground">
                    <span className="font-mono text-[10px] text-faint">{fmtDateTime(a.created_at)}</span>{" "}
                    · <span className="text-foreground">{a.actor?.full_name ?? a.actor?.email ?? "Someone"}</span>{" "}
                    {describeActivity(a)}
                  </li>
                ))}
              </ul>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
```

#### `src/app/(app)/admin/users/status-toggle.tsx`

```tsx
"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setUserActive } from "./actions";

export function StatusToggle({ userId, isActive }: { userId: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await setUserActive(userId, !isActive);
        })
      }
    >
      {isActive ? "Deactivate" : "Activate"}
    </Button>
  );
}
```

#### `src/app/(app)/app-shell.tsx`

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PendingSyncBanner } from "@/components/pending-sync-banner";
import { signOut } from "./actions";

type Warehouse = { id: string; name: string };
type Profile = { full_name: string | null; email: string; is_dashboard_admin: boolean } | null;

function HamburgerIcon() {
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
      <line x1="0" y1="1" x2="18" y2="1" stroke="currentColor" strokeWidth="1.5" />
      <line x1="0" y1="7" x2="18" y2="7" stroke="currentColor" strokeWidth="1.5" />
      <line x1="0" y1="13" x2="18" y2="13" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M2 7.5 8 2l6 5.5M3.5 6.5V13a.5.5 0 0 0 .5.5h3v-4h2v4h3a.5.5 0 0 0 .5-.5V6.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 7.25v4M8 5.25v.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

const SIDEBAR_WIDTH = "11.5rem"; // w-46 equivalent
const SIDEBAR_COLLAPSED = "3rem";

// Sidebar links pop slightly and shift to a light red on hover.
const SIDEBAR_LINK_HOVER = "transition-all duration-150 ease-out hover:translate-x-0.5 hover:text-coral"

export function AppShell({
  profile,
  warehouses,
  children,
}: {
  profile: Profile;
  warehouses: Warehouse[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isAdmin = !!profile?.is_dashboard_admin;

  return (
    <div className="flex h-full min-h-screen flex-1">
      <nav
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        style={{ width: open ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED }}
        className="sticky top-0 flex h-screen shrink-0 flex-col overflow-hidden border-r border-border bg-card py-3.5 transition-[width] duration-200 ease-in-out"
      >
        <div className="ml-2 mb-3 flex shrink-0 flex-col gap-1">
          <button
            type="button"
            aria-label="Toggle sidebar"
            onClick={() => setOpen((v) => !v)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-muted"
          >
            <HamburgerIcon />
          </button>
        </div>
        <div
          style={{ width: SIDEBAR_WIDTH }}
          className={cn(
            "flex flex-1 flex-col overflow-y-auto overflow-x-hidden transition-opacity ease-in-out",
            open ? "opacity-100 duration-150 delay-100" : "pointer-events-none opacity-0 duration-75"
          )}
        >
          <Link
            href="/"
            aria-label="Home"
            className={cn(SIDEBAR_LINK_HOVER, "flex h-8 items-center gap-2 px-4 text-foreground hover:bg-muted")}
          >
            <HomeIcon />
            <span className="text-[12px] whitespace-nowrap">Home</span>
          </Link>
          <Link
            href="/about"
            aria-label="About the page"
            className={cn(SIDEBAR_LINK_HOVER, "flex h-8 items-center gap-2 px-4 text-foreground hover:bg-muted")}
          >
            <InfoIcon />
            <span className="text-[12px] whitespace-nowrap">About the page</span>
          </Link>
          <div className="mx-4 my-2.5 h-px bg-border" />
          <div className="px-4 pb-2 text-[9px] uppercase tracking-[0.07em] text-faint">Warehouses</div>
          {warehouses.length === 0 && (
            <div className="px-4 py-1 text-[12px] text-muted-foreground">None yet</div>
          )}
          {warehouses.map((w) => {
            const href = `/warehouses/${w.id}`;
            const active = pathname === href;
            return (
              <Link
                key={w.id}
                href={href}
                className={cn(
                  SIDEBAR_LINK_HOVER,
                  "block px-4 py-1.5 text-[12px] whitespace-nowrap text-foreground",
                  active && "border-l-2 border-primary bg-accent pl-[14px] text-accent-foreground"
                )}
              >
                {w.name}
              </Link>
            );
          })}
          {isAdmin && (
            <>
              <div className="mx-4 my-2.5 h-px bg-border" />
              <Link
                href="/warehouses/manage"
                className={cn(
                  SIDEBAR_LINK_HOVER,
                  "block px-4 py-1.5 text-[12px] whitespace-nowrap text-muted-foreground",
                  pathname === "/warehouses/manage" &&
                    "border-l-2 border-primary bg-accent pl-[14px] text-accent-foreground"
                )}
              >
                Warehouse management
              </Link>
              <Link
                href="/admin/users"
                className={cn(
                  SIDEBAR_LINK_HOVER,
                  "block px-4 py-1.5 text-[12px] whitespace-nowrap text-muted-foreground",
                  pathname === "/admin/users" &&
                    "border-l-2 border-primary bg-accent pl-[14px] text-accent-foreground"
                )}
              >
                User management
              </Link>
            </>
          )}
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-card px-4.5 py-3">
          <span className="text-[14px] font-medium tracking-[-0.015em] text-foreground">
            Frozen warehouse launch readiness
          </span>
          <div className="flex items-center gap-3">
            <span className="text-[11.5px] text-muted-foreground">
              {profile?.full_name ?? profile?.email}
              {isAdmin ? " · Dashboard Admin" : ""}
            </span>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
        <PendingSyncBanner />
        <main className="min-w-0 flex-1 bg-background">{children}</main>
      </div>
    </div>
  );
}
```

#### `src/app/(app)/layout.tsx`

```tsx
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "./app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;

  const [{ data: profile }, { data: warehouses }] = await Promise.all([
    supabase.from("profiles").select("full_name, email, is_dashboard_admin").eq("id", uid).single(),
    supabase.from("warehouses").select("id, name").eq("is_active", true).order("name"),
  ]);

  return (
    <AppShell profile={profile} warehouses={warehouses ?? []}>
      {children}
    </AppShell>
  );
}
```

#### `src/app/(app)/page.tsx`

```tsx
import { createClient } from "@/lib/supabase/server";
import { WarehouseCard } from "@/components/warehouse-card";
import { daysUntil, nextToLaunch, sortByLaunchProximity, type WarehouseReadiness } from "@/lib/readiness";
import { cn, CARD_HOVER } from "@/lib/utils";

export default async function Home() {
  const supabase = await createClient();
  const [{ data }, { data: activeWarehouses }] = await Promise.all([
    supabase
      .from("warehouse_readiness")
      .select("id, name, go_live_date, total_raised, open_count, open_high_count"),
    supabase.from("warehouses").select("id").eq("is_active", true),
  ]);

  const activeIds = new Set((activeWarehouses ?? []).map((w) => w.id));
  const warehouses = ((data ?? []) as WarehouseReadiness[]).filter((w) => activeIds.has(w.id));
  const sorted = sortByLaunchProximity(warehouses);
  const next = nextToLaunch(warehouses);
  const nextDays = next ? daysUntil(next.go_live_date) : null;

  const totals = warehouses.reduce(
    (acc, w) => ({
      open: acc.open + w.open_count,
      openHigh: acc.openHigh + w.open_high_count,
      raised: acc.raised + w.total_raised,
    }),
    { open: 0, openHigh: 0, raised: 0 }
  );

  if (warehouses.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-muted-foreground">
        No warehouses yet. Use &ldquo;Warehouse management&rdquo; in the sidebar to create the first one.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 sm:py-8 lg:px-[50px]">
      <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div className={cn(CARD_HOVER, "flex flex-col justify-center rounded-card border border-border bg-card p-3.5")}>
          <div className="mb-1.5 text-[9px] uppercase tracking-[0.07em] text-faint">All warehouses</div>
          <div className="flex items-center gap-6">
            <div>
              <div className="font-mono text-[22px] leading-none">{totals.open}</div>
              <div className="text-[9px] uppercase tracking-[0.07em] text-faint">Open</div>
            </div>
            <div>
              <div className="font-mono text-[22px] leading-none text-red">
                {totals.openHigh}
              </div>
              <div className="text-[9px] uppercase tracking-[0.07em] text-faint">Open high</div>
            </div>
            <div>
              <div className="font-mono text-[22px] leading-none">{totals.raised}</div>
              <div className="text-[9px] uppercase tracking-[0.07em] text-faint">Raised</div>
            </div>
          </div>
        </div>

        <div className={cn(CARD_HOVER, "flex flex-col justify-center rounded-card border border-border bg-card p-3.5")}>
          <div className="text-[9px] uppercase tracking-[0.07em] text-faint">Next to launch</div>
          {next ? (
            <>
              <div className="mt-1 text-[15px] font-medium text-foreground">{next.name}</div>
              <div className="mt-0.5 text-[12px] text-muted-foreground">
                Opens in {nextDays} days with {next.open_count} snags still open
              </div>
            </>
          ) : (
            <div className="mt-1 text-[12px] text-muted-foreground">No upcoming launch date set</div>
          )}
        </div>
      </div>

      <div className="mb-2.5 text-[9px] uppercase tracking-[0.07em] text-faint">
        {warehouses.length} warehouse{warehouses.length === 1 ? "" : "s"} · soonest launch first
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {sorted.map((w) => (
          <WarehouseCard key={w.id} w={w} />
        ))}
      </div>
    </div>
  );
}
```

#### `src/app/(app)/warehouses/[id]/actions.ts`

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateGoLiveDate(
  warehouseId: string,
  date: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_go_live_date", {
    p_warehouse_id: warehouseId,
    p_date: date || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
```

#### `src/app/(app)/warehouses/[id]/filter-utils.ts`

```ts
export function parseMulti(value: string | undefined): string[] {
  return value ? value.split(",").filter(Boolean) : [];
}
```

#### `src/app/(app)/warehouses/[id]/go-live-editor.tsx`

```tsx
"use client";

import { useState, useTransition } from "react";
import { updateGoLiveDate } from "./actions";

export function GoLiveEditor({
  warehouseId,
  goLiveDate,
}: {
  warehouseId: string;
  goLiveDate: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(goLiveDate ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-[13.5px] underline-offset-2 hover:underline"
      >
        {goLiveDate
          ? new Date(goLiveDate + "T00:00:00").toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "Set date"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="rounded-md border border-input bg-background px-1.5 py-0.5 text-[12px]"
      />
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await updateGoLiveDate(warehouseId, value);
            if (result.error) {
              setError(result.error);
              return;
            }
            setError(null);
            setEditing(false);
          })
        }
        className="text-[12px] font-medium text-primary"
      >
        Save
      </button>
      <button type="button" onClick={() => setEditing(false)} className="text-[12px] text-muted-foreground">
        Cancel
      </button>
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </div>
  );
}
```

#### `src/app/(app)/warehouses/[id]/go-live-history-info.tsx`

```tsx
export type GoLiveChange = {
  id: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  actor: { full_name: string | null; email: string } | null;
};

function fmtDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

function describeChange(c: GoLiveChange) {
  const to = c.new_value ? fmtDate(c.new_value) : "not set";
  return c.old_value ? `Changed from ${fmtDate(c.old_value)} to ${to}` : `Set to ${to}`;
}

// Hover-only, CSS-driven (group/group-hover) rather than JS state — the
// tooltip has no interactivity of its own beyond scrolling, so it doesn't
// need to be a client component.
//
// The hover target is split into two nested boxes on purpose: the outer one
// carries the invisible pt-1.5 gap above the visible box, so that gap is
// still part of the hoverable area (no pointer-events-none, no margin) —
// otherwise moving the mouse from the icon down into the box crosses a dead
// zone with nothing under the cursor, which drops the hover state and
// closes the tooltip before you can reach it or scroll a long list.
export function GoLiveHistoryInfo({ changes }: { changes: GoLiveChange[] }) {
  return (
    <span className="group relative inline-flex cursor-help items-center" aria-label="Go-live date change history">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="text-faint group-hover:text-foreground">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 7.25v4M8 5.25v.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <div className="invisible absolute right-0 top-full z-30 w-72 max-w-[min(18rem,calc(100vw-1.5rem))] pt-1.5 opacity-0 transition-opacity duration-100 group-hover:visible group-hover:opacity-100">
        <div className="max-h-56 overflow-hidden rounded-md bg-foreground text-[11px] leading-relaxed text-background shadow-md">
          <div className="px-2.5 pb-1 pt-2 font-medium">Go-live date history</div>
          <div className="max-h-44 overflow-y-auto px-2.5 pb-2">
            {changes.length === 0 ? (
              <p className="text-background/70">No changes recorded yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {changes.map((c) => (
                  <li key={c.id}>
                    <span className="font-mono text-background/80">{fmtDateTime(c.created_at)}</span>
                    {" · "}
                    {c.actor?.full_name ?? c.actor?.email ?? "Someone"} — {describeChange(c)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </span>
  );
}
```

#### `src/app/(app)/warehouses/[id]/import/import-form.tsx`

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { downloadImportTemplate, parseImportFile, type ImportRow, type ImportRowError } from "@/lib/excel";
import { raiseSnag } from "../snags/new/actions";

type Phase = "idle" | "parsed" | "importing" | "done";

export function ImportForm({ warehouseId }: { warehouseId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [errors, setErrors] = useState<ImportRowError[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [results, setResults] = useState<{ succeeded: number; failed: ImportRowError[] }>({
    succeeded: 0,
    failed: [],
  });

  async function onFileSelected(file: File) {
    setFileName(file.name);
    const { rows: parsedRows, errors: parseErrors } = await parseImportFile(file);
    setRows(parsedRows);
    setErrors(parseErrors);
    setPhase("parsed");
  }

  async function commitImport() {
    setPhase("importing");
    let succeeded = 0;
    const failed: ImportRowError[] = [];

    // Row by row through the same RPC-gated path as a manual raise — no
    // bulk-insert shortcut around the reporter check or activity log.
    for (const row of rows) {
      const result = await raiseSnag(warehouseId, {
        description: row.description,
        category: row.category,
        subCategory: row.subCategory,
        subCategoryOther: row.subCategoryOther,
        location: row.location,
        scope: row.scope,
        severity: row.severity,
      });
      if (result.error) {
        failed.push({ rowNumber: row.rowNumber, message: result.error });
      } else {
        succeeded++;
      }
    }

    setResults({ succeeded, failed });
    setPhase("done");
  }

  if (phase === "done") {
    return (
      <div>
        <div className="rounded-md border border-mint bg-mint p-3 text-[13px] text-mint-deep">
          {results.succeeded} snag{results.succeeded === 1 ? "" : "s"} imported.
        </div>
        {results.failed.length > 0 && (
          <div className="mt-3 rounded-md border border-blush bg-blush p-3">
            <p className="text-[12.5px] font-medium text-red-deep">
              {results.failed.length} row{results.failed.length === 1 ? "" : "s"} failed:
            </p>
            <ul className="mt-1 list-disc pl-4">
              {results.failed.map((f) => (
                <li key={f.rowNumber} className="text-[12px] text-red-deep">
                  Row {f.rowNumber}: {f.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        <Button type="button" className="mt-4" onClick={() => router.push(`/warehouses/${warehouseId}`)}>
          Back to warehouse
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-[12.5px] text-muted-foreground">
          Download the template, fill in one row per snag, then upload it below.
        </p>
        <Button type="button" variant="outline" onClick={() => downloadImportTemplate()}>
          Download template
        </Button>
      </div>

      <div>
        <label className="flex h-11 cursor-pointer items-center justify-center rounded-md border border-dashed border-input text-[12.5px] text-muted-foreground hover:bg-muted">
          {fileName ?? "Upload filled-in template (.xlsx)"}
          <input
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFileSelected(e.target.files[0])}
          />
        </label>
      </div>

      {phase === "parsed" && (
        <div>
          {errors.length > 0 ? (
            <div className="rounded-md border border-blush bg-blush p-3">
              <p className="text-[12.5px] font-medium text-red-deep">
                {errors.length} row{errors.length === 1 ? "" : "s"} need fixing before anything is imported:
              </p>
              <ul className="mt-1 list-disc pl-4">
                {errors.map((e, i) => (
                  <li key={i} className="text-[12px] text-red-deep">
                    Row {e.rowNumber}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-md border border-mint bg-mint p-3 text-[12.5px] text-mint-deep">
              {rows.length} row{rows.length === 1 ? "" : "s"} validated and ready to import.
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-line-soft pt-3.5">
        <Button type="button" variant="outline" onClick={() => history.back()}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={phase !== "parsed" || errors.length > 0 || rows.length === 0}
          onClick={commitImport}
        >
          {phase === "importing" ? "Importing…" : `Import ${rows.length || ""} snag${rows.length === 1 ? "" : "s"}`}
        </Button>
      </div>
    </div>
  );
}
```

#### `src/app/(app)/warehouses/[id]/import/page.tsx`

```tsx
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { REPORTER_ROLES } from "@/lib/roles";
import { ImportForm } from "./import-form";

export default async function ImportSnagsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;

  const [{ data: warehouse }, { data: membership }, { data: me }] = await Promise.all([
    supabase.from("warehouses").select("id, name").eq("id", id).single(),
    supabase.from("warehouse_members").select("role").eq("warehouse_id", id).eq("user_id", uid ?? ""),
    supabase.from("profiles").select("is_dashboard_admin").eq("id", uid ?? "").maybeSingle(),
  ]);

  if (!warehouse) notFound();

  // Dashboard Admin bypasses the reporter tag here too — matches raise_snag's RPC-level check.
  const isReporter =
    (membership ?? []).some((m) => REPORTER_ROLES.includes(m.role)) || (me?.is_dashboard_admin ?? false);
  if (!isReporter) {
    redirect(`/warehouses/${id}`);
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6 sm:max-w-3xl sm:px-6 sm:py-8 lg:max-w-4xl lg:px-[50px]">
      <div className="rounded-card border border-border bg-card p-5 sm:p-7">
        <h1 className="text-[15px] font-medium tracking-[-0.015em] text-foreground">
          Import snags
        </h1>
        <p className="mb-4 mt-0.5 text-[12px] text-muted-foreground">{warehouse.name}</p>
        <ImportForm warehouseId={id} />
      </div>
    </div>
  );
}
```

#### `src/app/(app)/warehouses/[id]/page.tsx`

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { SnagTable, type SnagRow } from "@/components/snag-table";
import type { UpdateRow, AttachmentRow, ActivityRow } from "@/components/snag-row";
import { TeamBlock } from "@/components/team-block";
import { BurnUpChart } from "@/components/burn-up-chart";
import { ExportButton } from "@/components/export-button";
import { REPORTER_ROLES, RESOLVER_ROLES, roleLabel } from "@/lib/roles";
import { daysUntil } from "@/lib/readiness";
import { GoLiveEditor } from "./go-live-editor";
import { GoLiveHistoryInfo, type GoLiveChange } from "./go-live-history-info";
import { SnagFilters } from "./snag-filters";
import { SearchBox } from "./search-box";
import { RaisedBanner } from "./raised-banner";
import { parseMulti } from "./filter-utils";
import { cn, CARD_HOVER } from "@/lib/utils";

export default async function WarehouseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    status?: string;
    q?: string;
    raised?: string;
    category?: string;
    sub_category?: string;
    location?: string;
    scope?: string;
    severity?: string;
  }>;
}) {
  const { id } = await params;
  const { status, q = "", raised, category, sub_category, location, scope, severity } =
    await searchParams;
  const statusValues = parseMulti(status);
  const categoryValues = parseMulti(category);
  const subCategoryValues = parseMulti(sub_category);
  const locationValues = parseMulti(location);
  const scopeValues = parseMulti(scope);
  const severityValues = parseMulti(severity);
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getClaims();
  const uid = auth?.claims?.sub;

  const [
    { data: w },
    { data: membership },
    { data: teamRows },
    { data: snapshots },
    { data: me },
    { data: allProfiles },
    { data: goLiveChanges },
  ] = await Promise.all([
    supabase
      .from("warehouse_readiness")
      .select("id, name, go_live_date, total_raised, open_count, open_high_count")
      .eq("id", id)
      .single(),
    supabase.from("warehouse_members").select("role").eq("warehouse_id", id).eq("user_id", uid ?? ""),
    supabase
      .from("warehouse_members")
      .select("user_id, role, profile:profiles(full_name, email)")
      .eq("warehouse_id", id),
    supabase
      .from("snag_daily_snapshot")
      .select("snapshot_date, total_raised, total_closed")
      .eq("warehouse_id", id)
      .order("snapshot_date"),
    supabase.from("profiles").select("is_dashboard_admin").eq("id", uid ?? "").maybeSingle(),
    supabase.from("profiles").select("id, is_dashboard_admin"),
    supabase
      .from("warehouse_activity")
      .select("id, old_value, new_value, created_at, actor:profiles(full_name, email)")
      .eq("warehouse_id", id)
      .eq("action", "go_live_date_change")
      .order("created_at", { ascending: false }),
  ]);

  if (!w) notFound();

  // Dashboard Admin bypasses the reporter/resolver tag on snag actions the
  // same way it already bypasses read scoping — matches the RPC-level
  // check in raise_snag/post_snag_update/verify_snag_closure/close_snag_directly.
  const isDashboardAdmin = me?.is_dashboard_admin ?? false;
  // Real membership, not bypass-merged — the chat compose box needs to tell
  // "genuinely tagged both reporter and resolver" apart from "admin with no
  // tag at all," which an isReporter/isResolver OR'd with admin can't do.
  const hasReporterTag = (membership ?? []).some((m) => REPORTER_ROLES.includes(m.role));
  const hasResolverTag = (membership ?? []).some((m) => RESOLVER_ROLES.includes(m.role));
  const isReporter = hasReporterTag || isDashboardAdmin;
  const isResolver = hasResolverTag || isDashboardAdmin;
  const daysToGoLive = daysUntil(w.go_live_date);
  const team = (teamRows ?? []).map((t) => ({
    role: t.role,
    full_name: (t.profile as unknown as { full_name: string | null; email: string } | null)?.full_name ?? null,
    email: (t.profile as unknown as { full_name: string | null; email: string } | null)?.email ?? "",
  }));

  // Lets the chat feed show a message's author's actual operational role
  // (e.g. "HVAC Engineer") instead of just the generic reporter/resolver
  // bucket. A person can hold more than one role on this warehouse, so this
  // is a list per user, joined at render time.
  const rolesByUserId: Record<string, string[]> = {};
  for (const t of teamRows ?? []) {
    (rolesByUserId[t.user_id] ??= []).push(roleLabel(t.role));
  }

  // A message's role badge should say "Dashboard Admin" for someone who
  // posted via the admin bypass with no real tag here — not the generic
  // reporter/resolver bucket label, which isn't true of them. Needed
  // separately from rolesByUserId since admin status is global, not scoped
  // to this warehouse's membership rows.
  const adminUserIds = (allProfiles ?? []).filter((p) => p.is_dashboard_admin).map((p) => p.id);

  let query = supabase
    .from("snags")
    .select(
      "id, serial_no, date_raised, description, category, sub_category, sub_category_other, location, scope, severity, status, etc_date, closed_at, raised_by, raised_by_profile:profiles!snags_raised_by_fkey(full_name, email)"
    )
    .eq("warehouse_id", id)
    .order("serial_no", { ascending: false });

  if (statusValues.length) query = query.in("status", statusValues);
  if (q) query = query.ilike("description", `%${q}%`);
  if (categoryValues.length) query = query.in("category", categoryValues);
  if (subCategoryValues.length) query = query.in("sub_category", subCategoryValues);
  if (locationValues.length) query = query.in("location", locationValues);
  if (scopeValues.length) query = query.in("scope", scopeValues);
  if (severityValues.length) query = query.in("severity", severityValues);

  const { data: snags } = await query;

  const snagIds = (snags ?? []).map((s) => s.id);
  const { data: updates } = snagIds.length
    ? await supabase
        .from("snag_updates")
        .select("id, snag_id, body, author_id, author_side, created_at, author:profiles(full_name, email)")
        .in("snag_id", snagIds)
        .order("created_at")
    : { data: [] as never[] };

  const updatesBySnag: Record<string, UpdateRow[]> = {};
  for (const u of updates ?? []) {
    const key = (u as { snag_id: string }).snag_id;
    (updatesBySnag[key] ??= []).push(u as unknown as UpdateRow);
  }

  const { data: attachmentRows } = snagIds.length
    ? await supabase
        .from("attachments")
        .select("id, snag_id, update_id, media_type, thumbnail_url, file_url")
        .in("snag_id", snagIds)
        .order("created_at")
    : { data: [] as never[] };

  const paths = (attachmentRows ?? []).flatMap((a) => [a.thumbnail_url, a.file_url]);
  const { data: signedUrls } = paths.length
    ? await supabase.storage.from("attachments").createSignedUrls(paths, 3600)
    : { data: [] as { path: string | null; signedUrl: string }[] | null };
  const urlByPath = new Map((signedUrls ?? []).map((s) => [s.path, s.signedUrl]));

  const attachmentsBySnag: Record<string, AttachmentRow[]> = {};
  for (const a of attachmentRows ?? []) {
    (attachmentsBySnag[a.snag_id] ??= []).push({
      id: a.id,
      update_id: a.update_id,
      media_type: a.media_type,
      thumbnail_url: urlByPath.get(a.thumbnail_url) ?? "",
      file_url: urlByPath.get(a.file_url) ?? "",
    });
  }

  const { data: activityRows } = snagIds.length
    ? await supabase
        .from("snag_activity")
        .select("id, snag_id, action, field, old_value, new_value, created_at, actor:profiles(full_name, email)")
        .in("snag_id", snagIds)
        .order("created_at")
    : { data: [] as never[] };

  const activityBySnag: Record<string, ActivityRow[]> = {};
  for (const a of activityRows ?? []) {
    const key = (a as { snag_id: string }).snag_id;
    (activityBySnag[key] ??= []).push(a as unknown as ActivityRow);
  }

  const summaryTiles = [
    { label: "Snags Open", value: w.open_count, highlight: false },
    { label: "Snags Closed", value: w.total_raised - w.open_count, highlight: false },
    { label: "Total Snags Raised", value: w.total_raised, highlight: false },
    { label: "Snags Marked High Severity", value: w.open_high_count, highlight: true },
  ];

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 sm:py-8 lg:px-[50px]">
      <div className="mb-3 flex items-baseline justify-between">
        <h1 className="text-[17px] font-medium tracking-[-0.015em] text-foreground">{w.name}</h1>
        {isResolver ? (
          <div className="flex items-baseline gap-1.5 text-[13.5px] text-foreground">
            <span className="text-muted-foreground">Go-live date:</span>
            <GoLiveEditor warehouseId={id} goLiveDate={w.go_live_date} />
            <GoLiveHistoryInfo changes={(goLiveChanges ?? []) as unknown as GoLiveChange[]} />
          </div>
        ) : (
          <span className="flex items-baseline gap-1.5 text-[13px] text-muted-foreground">
            Go-live date:{" "}
            <span className="font-mono text-[11px] text-faint">
              {w.go_live_date
                ? new Date(w.go_live_date + "T00:00:00")
                    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                    .toUpperCase()
                : "NOT SET"}
            </span>
            <GoLiveHistoryInfo changes={(goLiveChanges ?? []) as unknown as GoLiveChange[]} />
          </span>
        )}
      </div>

      <div className="mb-3 mt-2.5 grid grid-cols-1 gap-2.5 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="grid grid-cols-2 auto-rows-fr gap-2">
          {summaryTiles.map((tile) => (
            <div
              key={tile.label}
              className={cn(
                CARD_HOVER,
                "rounded-md border p-2.5 hover:bg-blush",
                tile.highlight ? "border-blush bg-blush" : "border-border bg-card"
              )}
            >
              <div className={`font-mono text-[19px] ${tile.highlight ? "text-red-deep" : ""}`}>{tile.value}</div>
              <div className={`text-[9px] ${tile.highlight ? "text-red-deep" : "text-faint"}`}>{tile.label}</div>
            </div>
          ))}
          <div className={cn(CARD_HOVER, "col-span-2 rounded-md border border-border bg-card p-2.5 hover:bg-blush")}>
            <div className="font-mono text-[19px]">{daysToGoLive ?? "—"}</div>
            <div className="text-[9px] text-faint">Days left for launch</div>
          </div>
        </div>
        <BurnUpChart snapshots={snapshots ?? []} goLiveDate={w.go_live_date} liveTotalRaised={w.total_raised} liveTotalClosed={w.total_raised - w.open_count} />
      </div>

      {raised && <RaisedBanner serialNo={raised} />}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SnagFilters />
        <SearchBox />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ExportButton snags={(snags ?? []) as unknown as SnagRow[]} warehouseName={w.name} />
          {isReporter && (
            <>
              <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/warehouses/${id}/import`} />}>
                Import
              </Button>
              <Button size="sm" nativeButton={false} render={<Link href={`/warehouses/${id}/snags/new`} />}>
                Add snag
              </Button>
            </>
          )}
        </div>
      </div>

      <p className="mb-1.5 text-[12.5px] text-muted-foreground">
        Click a row to expand its update log and see attached photos/videos.
      </p>

      <SnagTable
        snags={(snags ?? []) as unknown as SnagRow[]}
        updatesBySnag={updatesBySnag}
        attachmentsBySnag={attachmentsBySnag}
        activityBySnag={activityBySnag}
        warehouseId={id}
        hasReporterTag={hasReporterTag}
        hasResolverTag={hasResolverTag}
        isDashboardAdmin={isDashboardAdmin}
        rolesByUserId={rolesByUserId}
        adminUserIds={adminUserIds}
        currentUserId={uid ?? ""}
      />

      <div className="mt-3">
        <TeamBlock members={team} />
      </div>
    </div>
  );
}
```

#### `src/app/(app)/warehouses/[id]/raised-banner.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export function RaisedBanner({ serialNo }: { serialNo: string }) {
  const [mounted, setMounted] = useState(true);
  const [exiting, setExiting] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const timer = setTimeout(() => setExiting(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!exiting) return;
    const timer = setTimeout(() => {
      setMounted(false);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("raised");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exiting]);

  if (!mounted) return null;

  return (
    <div
      className={`mb-3 max-h-16 overflow-hidden rounded-md border border-mint bg-mint px-3 py-2 text-[12.5px] text-mint-deep transition-all duration-300 ease-in ${
        exiting ? "max-h-0 -translate-y-2 border-0 px-3 py-0 opacity-0" : "translate-y-0 opacity-100"
      }`}
    >
      Snag #{String(serialNo).padStart(3, "0")} raised.
    </div>
  );
}
```

#### `src/app/(app)/warehouses/[id]/search-box.tsx`

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

export function SearchBox() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (q !== (searchParams.get("q") ?? "")) {
        const params = new URLSearchParams(searchParams.toString());
        if (q) params.set("q", q);
        else params.delete("q");
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <input
      value={q}
      onChange={(e) => setQ(e.target.value)}
      placeholder="Search description…"
      className="rounded-md border border-input bg-background px-2.5 py-1 text-[12px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    />
  );
}
```

#### `src/app/(app)/warehouses/[id]/snag-actions.ts`

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function postSnagUpdate(
  warehouseId: string,
  snagId: string,
  body: string,
  actingAs: "reporter" | "resolver",
  etcDate: string | null,
  status: string | null
): Promise<{ updateId: string | null; error: string | null }> {
  if (!body.trim()) {
    return { updateId: null, error: "Update text is required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("post_snag_update", {
      p_snag_id: snagId,
      p_body: body.trim(),
      p_etc_date: etcDate || null,
      p_status: status || null,
      p_acting_as: actingAs,
    })
    .select()
    .single();

  if (error) {
    return { updateId: null, error: error.message };
  }

  revalidatePath(`/warehouses/${warehouseId}`);
  return { updateId: (data as { id: string }).id, error: null };
}

export async function closeSnagDirectly(
  warehouseId: string,
  snagId: string,
  body: string | null
): Promise<{ updateId: string | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("close_snag_directly", { p_snag_id: snagId, p_body: body?.trim() || null })
    .select()
    .single();

  if (error) {
    return { updateId: null, error: error.message };
  }

  revalidatePath(`/warehouses/${warehouseId}`);
  return { updateId: (data as { update_id: string | null }).update_id, error: null };
}

export async function verifySnagClosure(
  warehouseId: string,
  snagId: string,
  approved: boolean,
  body: string | null
): Promise<{ updateId: string | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("verify_snag_closure", {
      p_snag_id: snagId,
      p_approved: approved,
      p_body: body?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    return { updateId: null, error: error.message };
  }

  revalidatePath(`/warehouses/${warehouseId}`);
  return { updateId: (data as { update_id: string | null }).update_id, error: null };
}
```

#### `src/app/(app)/warehouses/[id]/snag-filters.tsx`

```tsx
"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { MultiSelectFilter } from "@/components/multi-select-filter";
import {
  CATEGORY_LABELS,
  LOCATION_LABELS,
  SCOPE_LABELS,
  SEVERITY_LABELS,
  STATUS_LABELS,
  SUB_CATEGORY_LABELS,
} from "@/lib/snags";
import { parseMulti } from "./filter-utils";

function toOptions(labels: Record<string, string>) {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

const FILTERS: { key: string; label: string; options: { value: string; label: string }[] }[] = [
  { key: "status", label: "Status", options: toOptions(STATUS_LABELS) },
  { key: "category", label: "Category", options: toOptions(CATEGORY_LABELS) },
  { key: "sub_category", label: "Sub-category", options: toOptions(SUB_CATEGORY_LABELS) },
  { key: "location", label: "Location", options: toOptions(LOCATION_LABELS) },
  { key: "scope", label: "Scope", options: toOptions(SCOPE_LABELS) },
  { key: "severity", label: "Severity", options: toOptions(SEVERITY_LABELS) },
];

export function SnagFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: string, values: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    if (values.length === 0) {
      params.delete(key);
    } else {
      params.set(key, values.join(","));
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <>
      {FILTERS.map((f) => (
        <MultiSelectFilter
          key={f.key}
          label={f.label}
          options={f.options}
          selected={parseMulti(searchParams.get(f.key) ?? undefined)}
          onChange={(next) => updateParam(f.key, next)}
        />
      ))}
    </>
  );
}
```

#### `src/app/(app)/warehouses/[id]/snags/new/actions.ts`

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RaiseSnagInput = {
  description: string;
  category: string;
  subCategory: string;
  subCategoryOther: string | null;
  location: string;
  scope: string;
  severity: string;
};

export type DuplicateCandidate = {
  id: string;
  serial_no: number;
  description: string;
  status: string;
  raised_by_name: string | null;
};

export async function findSimilarSnags(
  warehouseId: string,
  location: string,
  subCategory: string,
  description: string
): Promise<DuplicateCandidate[]> {
  if (!description.trim()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("find_similar_snags", {
    p_warehouse_id: warehouseId,
    p_location: location,
    p_sub_category: subCategory,
    p_description: description,
  });

  if (error || !data) return [];
  return data as DuplicateCandidate[];
}

export async function raiseSnag(
  warehouseId: string,
  input: RaiseSnagInput,
  suppressedDuplicateIds: string[] = []
): Promise<{ snagId: string | null; serialNo: number | null; error: string | null }> {
  if (!input.description || !input.category || !input.subCategory || !input.location || !input.scope || !input.severity) {
    return { snagId: null, serialNo: null, error: "All fields are required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("raise_snag", {
      p_warehouse_id: warehouseId,
      p_description: input.description,
      p_category: input.category,
      p_sub_category: input.subCategory,
      p_sub_category_other: input.subCategoryOther,
      p_location: input.location,
      p_scope: input.scope,
      p_severity: input.severity,
      p_suppressed_duplicate_ids: suppressedDuplicateIds.length ? suppressedDuplicateIds : null,
    })
    .select()
    .single();

  if (error) {
    return { snagId: null, serialNo: null, error: error.message };
  }

  revalidatePath(`/warehouses/${warehouseId}`);
  const row = data as { id: string; serial_no: number };
  return { snagId: row.id, serialNo: row.serial_no, error: null };
}
```

#### `src/app/(app)/warehouses/[id]/snags/new/add-snag-form.tsx`

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MultiPhotoCaptureInput } from "@/components/photo-capture";
import { DuplicateCheckModal } from "@/components/duplicate-check-modal";
import { createClient } from "@/lib/supabase/client";
import { uploadAttachment, type PhotoCapture } from "@/lib/media";
import { enqueueSnag } from "@/lib/offline-queue";
import {
  CATEGORY_LABELS,
  LOCATION_LABELS,
  SCOPE_LABELS,
  SEVERITY_LABELS,
  SUB_CATEGORY_LABELS,
} from "@/lib/snags";
import { findSimilarSnags, raiseSnag, type DuplicateCandidate } from "./actions";

// Minimum 56px tap targets throughout — this form is used with gloved
// hands at -25°C (PLAN.md §5.7).
function RadioCards({
  options,
  value,
  onChange,
}: {
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([val, label]) => (
        <button
          key={val}
          type="button"
          onClick={() => onChange(val)}
          className={`min-h-14 rounded-md border px-3.5 py-3 text-[13px] ${
            value === val
              ? "border-primary bg-accent text-accent-foreground"
              : "border-input bg-background text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function AddSnagForm({
  warehouseId,
  warehouseName,
  currentUserId,
}: {
  warehouseId: string;
  warehouseName: string;
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [subCategoryOther, setSubCategoryOther] = useState("");
  const [location, setLocation] = useState("");
  const [scope, setScope] = useState("");
  const [severity, setSeverity] = useState("");
  const [photos, setPhotos] = useState<PhotoCapture[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[] | null>(null);

  const isComplete = Boolean(
    description.trim() &&
      category &&
      subCategory &&
      (subCategory !== "others" || subCategoryOther.trim()) &&
      location &&
      scope &&
      severity
  );

  async function doRaise(suppressedDuplicateIds: string[]) {
    const subCategoryOtherValue = subCategory === "others" ? subCategoryOther.trim() : null;

    const result = await raiseSnag(
      warehouseId,
      {
        description: description.trim(),
        category,
        subCategory,
        subCategoryOther: subCategoryOtherValue,
        location,
        scope,
        severity,
      },
      suppressedDuplicateIds
    );

    if (result.error || !result.snagId) {
      setError(result.error ?? "Could not raise the snag.");
      return;
    }

    if (photos.length > 0) {
      const supabase = createClient();
      for (let i = 0; i < photos.length; i++) {
        const uploadResult = await uploadAttachment(supabase, {
          warehouseId,
          snagId: result.snagId,
          mediaType: "image",
          file: photos[i].annotated,
          original: photos[i].original,
          thumbnail: photos[i].thumbnail,
          fileName: `snag-photo-${i + 1}.jpg`,
          uploaderId: currentUserId,
        });
        if (uploadResult.error) {
          setError(`Snag raised, but a photo failed to upload: ${uploadResult.error}`);
          return;
        }
      }
    }

    router.push(`/warehouses/${warehouseId}?raised=${result.serialNo}`);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const subCategoryOtherValue = subCategory === "others" ? subCategoryOther.trim() : null;

      // Offline-capable: queue locally and sync when connection returns
      // rather than letting the request hang or fail (PLAN.md §5.7). No
      // duplicate check while offline — that needs a network round trip.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await enqueueSnag({
          localId: crypto.randomUUID(),
          warehouseId,
          warehouseName,
          description: description.trim(),
          category,
          subCategory,
          subCategoryOther: subCategoryOtherValue,
          location,
          scope,
          severity,
          photos: photos.map((p) => ({ annotated: p.annotated, original: p.original, thumbnail: p.thumbnail })),
          createdAt: Date.now(),
        });
        setQueued(true);
        return;
      }

      const candidates = await findSimilarSnags(warehouseId, location, subCategory, description.trim());
      if (candidates.length > 0) {
        setDuplicates(candidates);
        return;
      }

      await doRaise([]);
    });
  }

  if (queued) {
    return (
      <div className="rounded-md border border-amber bg-amber p-4 text-center">
        <p className="text-[13px] font-medium text-amber-deep">Queued — pending sync</p>
        <p className="mt-1 text-[12px] text-amber-deep">
          No connection right now. This snag is saved on your device and will be raised
          automatically once you&apos;re back online.
        </p>
        <Button type="button" size="sm" className="mt-3" onClick={() => router.push(`/warehouses/${warehouseId}`)}>
          Back to warehouse
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label className="mb-1.5 text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
            Description
          </Label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={5}
            className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            placeholder="Add description"
          />
        </div>

        <div>
          <Label className="mb-1.5 text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
            Photos (optional)
          </Label>
          <MultiPhotoCaptureInput onChange={setPhotos} />
        </div>
      </div>

      <div>
        <Label className="mb-1.5 text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
          Sub-category
        </Label>
        <RadioCards
          value={subCategory}
          onChange={setSubCategory}
          options={Object.entries(SUB_CATEGORY_LABELS) as [string, string][]}
        />
        {subCategory === "others" && (
          <input
            value={subCategoryOther}
            onChange={(e) => setSubCategoryOther(e.target.value)}
            required
            placeholder="Describe the sub-category"
            className="mt-1.5 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-[12.5px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label className="mb-1.5 text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
            Category
          </Label>
          <RadioCards value={category} onChange={setCategory} options={Object.entries(CATEGORY_LABELS) as [string, string][]} />
        </div>

        <div>
          <Label className="mb-1.5 text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
            Location
          </Label>
          <RadioCards value={location} onChange={setLocation} options={Object.entries(LOCATION_LABELS) as [string, string][]} />
        </div>

        <div>
          <Label className="mb-1.5 text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
            Scope
          </Label>
          <RadioCards value={scope} onChange={setScope} options={Object.entries(SCOPE_LABELS) as [string, string][]} />
        </div>

        <div>
          <Label className="mb-1.5 text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
            Severity
          </Label>
          <RadioCards value={severity} onChange={setSeverity} options={Object.entries(SEVERITY_LABELS) as [string, string][]} />
          <p className="mt-1.5 text-[11.5px] font-medium text-red-deep">
            High means this stops the warehouse launching.
          </p>
        </div>
      </div>

      {error && <p className="text-[12.5px] text-destructive">{error}</p>}

      <div className="flex justify-end gap-2 border-t border-line-soft pt-3.5">
        <Button type="button" variant="outline" className="min-h-14" onClick={() => history.back()}>
          Cancel
        </Button>
        <Button type="button" className="min-h-14" disabled={pending || !isComplete} onClick={submit}>
          {pending ? "Raising…" : "Raise snag"}
        </Button>
      </div>

      {duplicates && (
        <DuplicateCheckModal
          candidates={duplicates}
          pending={pending}
          onCancel={() => setDuplicates(null)}
          onRaiseAnyway={() => {
            startTransition(async () => {
              await doRaise(duplicates.map((d) => d.id));
            });
          }}
        />
      )}
    </div>
  );
}
```

#### `src/app/(app)/warehouses/[id]/snags/new/page.tsx`

```tsx
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { REPORTER_ROLES } from "@/lib/roles";
import { AddSnagForm } from "./add-snag-form";

export default async function NewSnagPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;

  const [{ data: warehouse }, { data: membership }, { data: me }] = await Promise.all([
    supabase.from("warehouses").select("id, name").eq("id", id).single(),
    supabase.from("warehouse_members").select("role").eq("warehouse_id", id).eq("user_id", uid ?? ""),
    supabase.from("profiles").select("is_dashboard_admin").eq("id", uid ?? "").maybeSingle(),
  ]);

  if (!warehouse) notFound();

  // Dashboard Admin bypasses the reporter tag here too — matches raise_snag's RPC-level check.
  const isReporter =
    (membership ?? []).some((m) => REPORTER_ROLES.includes(m.role)) || (me?.is_dashboard_admin ?? false);
  if (!isReporter || !uid) {
    redirect(`/warehouses/${id}`);
  }

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 sm:py-8 lg:px-[50px]">
      <div className="rounded-card border border-border bg-card p-5 sm:p-7">
        <h1 className="text-[15px] font-medium tracking-[-0.015em] text-foreground">
          Raise a snag
        </h1>
        <p className="mb-4 mt-0.5 text-[12px] text-muted-foreground">{warehouse.name}</p>
        <AddSnagForm warehouseId={id} warehouseName={warehouse.name} currentUserId={uid} />
      </div>
    </div>
  );
}
```

#### `src/app/(app)/warehouses/manage/actions.ts`

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createWarehouseCode(
  code: string
): Promise<{ id: string | null; error: string | null }> {
  const trimmed = code.trim();
  if (!trimmed) return { id: null, error: "Warehouse code can't be empty." };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const uid = auth?.claims?.sub;

  const { data, error } = await supabase
    .from("warehouses")
    .insert({ name: trimmed, created_by: uid })
    .select("id")
    .single();

  if (error) {
    return { id: null, error: error.message };
  }

  await supabase.from("warehouse_activity").insert({
    warehouse_id: data.id,
    actor_id: uid,
    action: "create",
  });

  // Revalidate the whole layout tree, not just the current segment — the
  // sidebar's warehouse list lives in the shared (app) layout, and a plain
  // client-side router.refresh() to this page won't refetch it.
  revalidatePath("/", "layout");

  return { id: data.id, error: null };
}

export async function setWarehouseActive(
  warehouseId: string,
  isActive: boolean
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const uid = auth?.claims?.sub;

  const { error } = await supabase
    .from("warehouses")
    .update({ is_active: isActive })
    .eq("id", warehouseId);

  if (error) {
    return { error: error.message };
  }

  await supabase.from("warehouse_activity").insert({
    warehouse_id: warehouseId,
    actor_id: uid,
    action: isActive ? "activate" : "deactivate",
    field: "is_active",
    old_value: String(!isActive),
    new_value: String(isActive),
  });

  revalidatePath("/", "layout");
  return { error: null };
}
```

#### `src/app/(app)/warehouses/manage/page.tsx`

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WarehouseCodeManager } from "./warehouse-code-manager";
import type { WarehouseActivityRow } from "./warehouse-row";

export default async function WarehouseManagementPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;

  const { data: me } = await supabase
    .from("profiles")
    .select("is_dashboard_admin")
    .eq("id", uid)
    .single();

  if (!me?.is_dashboard_admin || !uid) {
    redirect("/");
  }

  const [{ data: warehouses }, { data: activity }] = await Promise.all([
    supabase.from("warehouses").select("id, name, is_active").order("name"),
    supabase
      .from("warehouse_activity")
      .select("id, warehouse_id, action, field, old_value, new_value, created_at, actor:profiles(full_name, email)")
      .order("created_at"),
  ]);

  const activityByWarehouse: Record<string, WarehouseActivityRow[]> = {};
  for (const a of activity ?? []) {
    const key = (a as { warehouse_id: string }).warehouse_id;
    (activityByWarehouse[key] ??= []).push(a as unknown as WarehouseActivityRow);
  }

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 sm:py-8 lg:px-[50px]">
      <h1 className="mb-4 text-[17px] text-foreground">Warehouse management</h1>
      <WarehouseCodeManager warehouses={warehouses ?? []} activityByWarehouse={activityByWarehouse} />
    </div>
  );
}
```

#### `src/app/(app)/warehouses/manage/status-filter.tsx`

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

export type StatusFilterValue = "all" | "active" | "deactivated";

const OPTIONS: { value: StatusFilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "deactivated", label: "Deactivated" },
];

export function StatusFilter({
  value,
  onChange,
}: {
  value: StatusFilterValue;
  onChange: (next: StatusFilterValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const currentLabel = OPTIONS.find((o) => o.value === value)?.label ?? "All";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`rounded-md border px-2 py-1 text-[11.5px] font-medium ${
          value !== "all"
            ? "border-primary bg-accent text-accent-foreground"
            : "border-teal bg-frost text-teal-deep"
        }`}
      >
        Current status: {currentLabel}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-40 overflow-hidden rounded-md border border-border bg-card py-1 shadow-md">
          {value !== "all" && (
            <button
              type="button"
              onClick={() => {
                onChange("all");
                setOpen(false);
              }}
              className="w-full px-2.5 py-1 text-left text-[11px] text-primary hover:bg-muted"
            >
              Clear
            </button>
          )}
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={`flex w-full items-center px-2.5 py-1.5 text-left text-[12px] hover:bg-muted ${
                value === o.value ? "font-medium text-foreground" : "text-foreground"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

#### `src/app/(app)/warehouses/manage/warehouse-code-manager.tsx`

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createWarehouseCode } from "./actions";
import { WarehouseRow, type WarehouseActivityRow } from "./warehouse-row";
import { StatusFilter, type StatusFilterValue } from "./status-filter";

type Warehouse = { id: string; name: string; is_active: boolean };

export function WarehouseCodeManager({
  warehouses,
  activityByWarehouse,
}: {
  warehouses: Warehouse[];
  activityByWarehouse: Record<string, WarehouseActivityRow[]>;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [creating, startCreate] = useTransition();
  const [createError, setCreateError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");

  function submit() {
    setCreateError(null);
    startCreate(async () => {
      const result = await createWarehouseCode(code);
      if (result.error) {
        setCreateError(result.error);
        return;
      }
      setCode("");
      router.refresh();
    });
  }

  const filtered =
    statusFilter === "all"
      ? warehouses
      : warehouses.filter((w) => (w.is_active ? "active" : "deactivated") === statusFilter);

  return (
    <div>
      <div className="mb-5 rounded-card border border-border bg-card p-4">
        <label className="mb-1.5 block text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
          Add new warehouse code
        </label>
        <div className="flex flex-wrap gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Warehouse code"
            className="max-w-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
          <Button type="button" disabled={creating || !code.trim()} onClick={submit}>
            {creating ? "Creating…" : "Create new warehouse"}
          </Button>
        </div>
        {createError && <p className="mt-1.5 text-[12.5px] text-destructive">{createError}</p>}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <StatusFilter value={statusFilter} onChange={setStatusFilter} />
        <p className="text-[12.5px] text-muted-foreground">Click a row to see its status history.</p>
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Warehouse code</TableHead>
              <TableHead className="text-center">Current status</TableHead>
              <TableHead className="text-center">Change status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No warehouses match this filter.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((w) => (
              <WarehouseRow key={w.id} warehouse={w} activity={activityByWarehouse[w.id] ?? []} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

#### `src/app/(app)/warehouses/manage/warehouse-row.tsx`

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { setWarehouseActive } from "./actions";

export type WarehouseActivityRow = {
  id: string;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  actor: { full_name: string | null; email: string } | null;
};

function fmtDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function describeActivity(a: WarehouseActivityRow): string {
  switch (a.action) {
    case "create":
      return "created this warehouse";
    case "activate":
      return "activated this warehouse";
    case "deactivate":
      return "deactivated this warehouse";
    case "go_live_date_change":
      return a.old_value
        ? `changed the go-live date from ${fmtDate(a.old_value)} to ${a.new_value ? fmtDate(a.new_value) : "not set"}`
        : `set the go-live date to ${a.new_value ? fmtDate(a.new_value) : "not set"}`;
    default:
      return a.action.replaceAll("_", " ");
  }
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

export function WarehouseRow({
  warehouse,
  activity,
}: {
  warehouse: { id: string; name: string; is_active: boolean };
  activity: WarehouseActivityRow[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <TableCell className="text-[13px] text-foreground">{warehouse.name}</TableCell>
        <TableCell className="text-center">
          <Badge
            variant="outline"
            className={
              warehouse.is_active
                ? "border-mint bg-mint text-mint-deep"
                : "border-line-soft bg-line-soft text-muted-foreground"
            }
          >
            {warehouse.is_active ? "Active" : "Deactivated"}
          </Badge>
        </TableCell>
        <TableCell className="text-center">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={(e) => {
              e.stopPropagation();
              setError(null);
              startTransition(async () => {
                const r = await setWarehouseActive(warehouse.id, !warehouse.is_active);
                if (r.error) setError(r.error);
                else router.refresh();
              });
            }}
          >
            {pending ? "Saving…" : warehouse.is_active ? "Deactivate" : "Activate"}
          </Button>
          {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-background hover:bg-background">
          <TableCell colSpan={3} className="whitespace-normal p-3">
            {activity.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">No history yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {activity.map((a) => (
                  <li key={a.id} className="text-[11.5px] text-muted-foreground">
                    <span className="font-mono text-[10px] text-faint">{fmtDateTime(a.created_at)}</span>{" "}
                    · <span className="text-foreground">{a.actor?.full_name ?? a.actor?.email ?? "Someone"}</span>{" "}
                    {describeActivity(a)}
                  </li>
                ))}
              </ul>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
```

#### `src/app/auth/confirm/route.ts`

```ts
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/forgot-password?error=invalid_or_expired`);
}
```

#### `src/app/auth/update-password/actions.ts`

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updatePassword(formData: FormData) {
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirm_password") as string;

  if (password !== confirmPassword) {
    redirect("/auth/update-password?error=password_mismatch");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(`/auth/update-password?error=${error.code === "weak_password" ? "weak_password" : "unknown"}`);
  }

  revalidatePath("/", "layout");
  redirect("/");
}
```

#### `src/app/auth/update-password/page.tsx`

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePassword } from "./actions";

const ERROR_COPY: Record<string, string> = {
  password_mismatch: "Those passwords don't match.",
  weak_password: "That password is too easy to guess. Try something longer or less common.",
  unknown: "Something went wrong. Try requesting a new reset link.",
};

export default async function UpdatePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  // Only reachable with the recovery session /auth/confirm just set —
  // no session here means the link was invalid, expired, or already used.
  if (!data?.claims) {
    redirect("/forgot-password?error=invalid_or_expired");
  }

  const { error } = await searchParams;
  const errorCopy = error ? ERROR_COPY[error] : undefined;

  return (
    <div className="flex flex-1 items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-[340px] overflow-hidden rounded-card border border-border bg-card">
        <div className="p-6">
          <h1 className="text-[17px] leading-tight text-foreground">Set a new password</h1>
          <p className="mt-1 mb-5 text-[13px] text-muted-foreground">Choose a new password for your account.</p>

          {errorCopy && (
            <div className="mb-4 rounded-md bg-accent p-3">
              <p className="text-[12.5px] text-accent-foreground">{errorCopy}</p>
            </div>
          )}

          <form action={updatePassword} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className="text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
                New password
              </Label>
              <Input id="password" name="password" type="password" minLength={8} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm_password" className="text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
                Confirm password
              </Label>
              <Input id="confirm_password" name="confirm_password" type="password" minLength={8} required />
            </div>
            <Button type="submit" className="mt-1 w-full">
              Update password
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
```

#### `src/app/forgot-password/actions.ts`

```ts
"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requestPasswordReset(formData: FormData) {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  if (!email) {
    redirect("/forgot-password");
  }

  const supabase = await createClient();
  const origin = (await headers()).get("origin");

  // Supabase never reveals whether an email is registered, so the caller
  // always sees the same "check your email" message regardless of this
  // result — don't branch the UI on error/success here.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/update-password`,
  });

  redirect("/forgot-password?sent=1");
}
```

#### `src/app/forgot-password/page.tsx`

```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "./actions";

const THERMOMETER = ["#DCEAEE", "#E4EBEA", "#EDEAE5", "#F5E7E0", "#FBE4DE", "#F2C7BB", "#E89484", "#C75B4E"];

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-[340px] overflow-hidden rounded-card border border-border bg-card">
        <div className="flex">
          {THERMOMETER.map((c, i) => (
            <span key={i} className="h-1.5 flex-1" style={{ background: c }} />
          ))}
        </div>
        <div className="p-6">
          <h1 className="text-[17px] leading-tight text-foreground">Reset your password</h1>
          <p className="mt-1 mb-5 text-[13px] text-muted-foreground">
            We&apos;ll email you a link to choose a new one.
          </p>

          {error === "invalid_or_expired" && (
            <div className="mb-4 rounded-md bg-accent p-3">
              <p className="text-[12.5px] font-medium text-accent-foreground">That link didn&apos;t work</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-accent-foreground">
                It may have expired or already been used. Request a new one below.
              </p>
            </div>
          )}

          {sent ? (
            <div className="rounded-md bg-mint p-3">
              <p className="text-[12.5px] font-medium text-mint-deep">Check your email</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-mint-deep">
                If an account exists for that address, a reset link is on its way.
              </p>
            </div>
          ) : (
            <form action={requestPasswordReset} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email" className="text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
                  Work email
                </Label>
                <Input id="email" name="email" type="email" placeholder="priya@company.com" required />
              </div>
              <Button type="submit" className="mt-1 w-full">
                Send reset link
              </Button>
            </form>
          )}

          <p className="mt-3 text-center text-[13px] text-muted-foreground">
            <a href="/login" className="hover:text-foreground">
              Back to sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
```

#### `src/app/layout.tsx`

```tsx
import type { Metadata } from "next";
import { Instrument_Sans, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500"],
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-data",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Frozen Warehouse Launch Readiness",
  description: "Snag tracking and launch readiness for frozen warehouse commissioning",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${instrumentSans.variable} ${inter.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

#### `src/app/login/actions.ts`

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signInWithPassword(formData: FormData) {
  const supabase = await createClient();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=invalid_credentials`);
  }

  revalidatePath("/", "layout");
  redirect("/");
}
```

#### `src/app/login/page.tsx`

```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInWithPassword } from "./actions";

const THERMOMETER = ["#DCEAEE", "#E4EBEA", "#EDEAE5", "#F5E7E0", "#FBE4DE", "#F2C7BB", "#E89484", "#C75B4E"];

const ERROR_COPY: Record<string, { title: string; body: string }> = {
  not_invited: {
    title: "This email isn't set up yet",
    body: "We don't have an invitation for that address. Ask your dashboard admin to add it, then sign in with that exact address.",
  },
  invalid_credentials: {
    title: "Couldn't sign you in",
    body: "That email and password combination doesn't match an account.",
  },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorInfo = error ? ERROR_COPY[error] : undefined;

  return (
    <div className="flex flex-1 items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-[340px] overflow-hidden rounded-card border border-border bg-card">
        <div className="flex">
          {THERMOMETER.map((c, i) => (
            <span key={i} className="h-1.5 flex-1" style={{ background: c }} />
          ))}
        </div>
        <div className="p-6">
          <h1 className="text-[17px] leading-tight text-foreground">
            Frozen warehouse
            <br />
            launch readiness
          </h1>
          <p className="mt-1 mb-5 text-[13px] text-muted-foreground">Sign in to continue</p>

          {errorInfo && (
            <div className="mb-4 rounded-md bg-accent p-3">
              <p className="text-[12.5px] font-medium text-accent-foreground">{errorInfo.title}</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-accent-foreground">
                {errorInfo.body}
              </p>
            </div>
          )}

          <form action={signInWithPassword} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
                Work email
              </Label>
              <Input id="email" name="email" type="email" placeholder="priya@company.com" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className="text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
                Password
              </Label>
              <Input id="password" name="password" type="password" required />
            </div>
            <Button type="submit" className="mt-1 w-full">
              Sign in
            </Button>
          </form>

          <p className="mt-3 flex items-center justify-center gap-3 text-center text-[13px] text-muted-foreground">
            <a href="/forgot-password" className="hover:text-foreground">
              Forgot your password?
            </a>
            <span className="text-line">·</span>
            <a href="/set-password" className="hover:text-foreground">
              Set your password
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
```

#### `src/app/set-password/actions.ts`

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function setPassword(formData: FormData) {
  const fullName = (formData.get("full_name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirm_password") as string;

  if (!fullName || !email || !password) {
    redirect("/set-password?error=missing_fields");
  }
  if (password !== confirmPassword) {
    redirect("/set-password?error=password_mismatch");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (error) {
    if (error.code === "weak_password") {
      redirect("/set-password?error=weak_password");
    }
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      redirect("/set-password?error=already_exists");
    }
    // The invitation-gate trigger raises a Postgres exception for an
    // unmatched email; Supabase surfaces that as a generic signup
    // failure rather than a distinct code, so once weak-password and
    // duplicate-account are ruled out, "not invited" is the only
    // realistic remaining cause.
    redirect("/set-password?error=not_invited");
  }

  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/");
  }

  redirect("/set-password?success=1");
}
```

#### `src/app/set-password/page.tsx`

```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setPassword } from "./actions";

const THERMOMETER = ["#DCEAEE", "#E4EBEA", "#EDEAE5", "#F5E7E0", "#FBE4DE", "#F2C7BB", "#E89484", "#C75B4E"];

const ERROR_COPY: Record<string, { title: string; body: string }> = {
  missing_fields: {
    title: "Missing information",
    body: "Fill in every field before submitting.",
  },
  not_invited: {
    title: "This email isn't set up yet",
    body: "We don't have an invitation for that address. Ask your dashboard admin to add it, then come back with that exact address.",
  },
  already_exists: {
    title: "This email already has an account",
    body: "Sign in instead, or use Forgot password if that account needs a password set.",
  },
  password_mismatch: {
    title: "Passwords don't match",
    body: "Type the same password in both fields.",
  },
  weak_password: {
    title: "Choose a stronger password",
    body: "That password is too easy to guess. Try something longer or less common.",
  },
};

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error, success } = await searchParams;
  const errorInfo = error ? ERROR_COPY[error] : undefined;

  return (
    <div className="flex flex-1 items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-[340px] overflow-hidden rounded-card border border-border bg-card">
        <div className="flex">
          {THERMOMETER.map((c, i) => (
            <span key={i} className="h-1.5 flex-1" style={{ background: c }} />
          ))}
        </div>
        <div className="p-6">
          <h1 className="text-[17px] leading-tight text-foreground">Set your password</h1>
          <p className="mt-1 mb-5 text-[13px] text-muted-foreground">
            For people invited by email who don&apos;t sign in with Google.
          </p>

          {success ? (
            <div className="rounded-md bg-mint p-3">
              <p className="text-[12.5px] font-medium text-mint-deep">Almost there</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-mint-deep">
                Check your email to confirm your address, then sign in.
              </p>
            </div>
          ) : (
            <>
              {errorInfo && (
                <div className="mb-4 rounded-md bg-accent p-3">
                  <p className="text-[12.5px] font-medium text-accent-foreground">{errorInfo.title}</p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-accent-foreground">{errorInfo.body}</p>
                </div>
              )}

              <form action={setPassword} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="full_name" className="text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
                    Full name
                  </Label>
                  <Input id="full_name" name="full_name" type="text" required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email" className="text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
                    Work email
                  </Label>
                  <Input id="email" name="email" type="email" placeholder="priya@company.com" required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password" className="text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
                    Password
                  </Label>
                  <Input id="password" name="password" type="password" minLength={8} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="confirm_password" className="text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
                    Confirm password
                  </Label>
                  <Input id="confirm_password" name="confirm_password" type="password" minLength={8} required />
                </div>
                <Button type="submit" className="mt-1 w-full">
                  Set password
                </Button>
              </form>
            </>
          )}

          <p className="mt-3 text-center text-[13px] text-muted-foreground">
            <a href="/login" className="hover:text-foreground">
              Back to sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
```

#### `src/components/burn-up-chart.tsx`

```tsx
"use client";

// PLAN.md §12: the only chart in the product. Two cumulative lines (raised,
// closed) with the shaded gap between them as the open count, projected
// forward to the go-live date. Shows real data from the first snag raised
// (not gated behind a week of history) — today's point always reflects
// live totals even if the daily snapshot job hasn't run yet today.

import { useState } from "react";

export type Snapshot = {
  snapshot_date: string;
  total_raised: number;
  total_closed: number;
};

const WIDTH = 620;
const HEIGHT = 150;
const PAD_LEFT = 30;
const PAD_RIGHT = 10;
const PAD_TOP = 14;
const PAD_BOTTOM = 20;

function toTime(dateStr: string) {
  return new Date(dateStr + "T00:00:00").getTime();
}

function todayStr() {
  return new Date().toLocaleDateString("en-CA");
}

function fmtShort(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function buildPath(points: { x: number; y: number }[]) {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

export function BurnUpChart({
  snapshots,
  goLiveDate,
  liveTotalRaised,
  liveTotalClosed,
}: {
  snapshots: Snapshot[];
  goLiveDate: string | null;
  liveTotalRaised: number;
  liveTotalClosed: number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const today = todayStr();
  const byDate = new Map(snapshots.map((s) => [s.snapshot_date, s]));
  // Live totals always win for today's point, even if the cron job hasn't
  // written today's snapshot row yet.
  byDate.set(today, { snapshot_date: today, total_raised: liveTotalRaised, total_closed: liveTotalClosed });
  const sortedRaw = [...byDate.values()].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
  // Cumulative totals should never decrease day over day — refresh_snag_daily_snapshot()
  // recomputes from the live snags table rather than keeping a true ever-incrementing
  // ledger, so a direct DB deletion (test-data cleanup; no such path exists in the UI)
  // can otherwise show up here as a drop that contradicts the "cumulative" premise the
  // two lines and their shaded gap depend on. Clamping the display to never decrease
  // was tried first and was wrong: today's true count sits *below* the stale pre-drop
  // peak, so a clamp freezes the chart at that fictional peak forever instead of ever
  // showing it. Truncating to start from the most recent drop is honest instead — it
  // shows the currently-valid run of history, not a doctored version of the discarded one.
  let resetAt = 0;
  for (let i = 1; i < sortedRaw.length; i++) {
    if (sortedRaw[i].total_raised < sortedRaw[i - 1].total_raised || sortedRaw[i].total_closed < sortedRaw[i - 1].total_closed) {
      resetAt = i;
    }
  }
  const sorted = sortedRaw.slice(resetAt);

  if (sorted.length === 0 || sorted[sorted.length - 1].total_raised === 0) {
    return (
      <div className="flex h-[150px] items-center justify-center rounded-card border border-border bg-card text-[12px] text-muted-foreground">
        No snags raised yet — the burn-up appears once the first one is.
      </div>
    );
  }

  const firstDate = sorted[0].snapshot_date;
  const lastDate = sorted[sorted.length - 1].snapshot_date;

  const hasTarget = !!goLiveDate && toTime(goLiveDate) > toTime(lastDate);
  const xEndDate = hasTarget ? goLiveDate! : lastDate;

  const xStart = toTime(firstDate);
  const xEnd = toTime(xEndDate);
  const xSpan = Math.max(1, xEnd - xStart);

  const maxRaised = Math.max(...sorted.map((s) => s.total_raised), 1);
  const yMax = Math.ceil(maxRaised * 1.15) || 1;

  const x = (dateStr: string) => PAD_LEFT + ((toTime(dateStr) - xStart) / xSpan) * (WIDTH - PAD_LEFT - PAD_RIGHT);
  const y = (v: number) => HEIGHT - PAD_BOTTOM - (v / yMax) * (HEIGHT - PAD_TOP - PAD_BOTTOM);

  const raisedPoints = sorted.map((s) => ({ x: x(s.snapshot_date), y: y(s.total_raised) }));
  const closedPoints = sorted.map((s) => ({ x: x(s.snapshot_date), y: y(s.total_closed) }));

  // Weekly tick marks from the first date through today, plus today itself.
  const weekTicks: string[] = [];
  for (let t = xStart; t <= toTime(today); t += 7 * 86_400_000) {
    weekTicks.push(new Date(t).toLocaleDateString("en-CA"));
  }
  if (weekTicks[weekTicks.length - 1] !== today) weekTicks.push(today);

  // Simple linear projection: slope from the trailing window of history,
  // extended to the go-live date.
  const windowSize = Math.min(7, sorted.length - 1);
  const trailStart = sorted[sorted.length - 1 - windowSize];
  const trailEnd = sorted[sorted.length - 1];
  const daySpan = Math.max(1, (toTime(trailEnd.snapshot_date) - toTime(trailStart.snapshot_date)) / 86_400_000);

  let raisedProjected: { x: number; y: number } | null = null;
  let closedProjected: { x: number; y: number } | null = null;
  if (hasTarget && sorted.length > 1) {
    const targetDays = (toTime(xEndDate) - toTime(trailEnd.snapshot_date)) / 86_400_000;
    const raisedSlope = (trailEnd.total_raised - trailStart.total_raised) / daySpan;
    const closedSlope = (trailEnd.total_closed - trailStart.total_closed) / daySpan;
    raisedProjected = {
      x: x(xEndDate),
      y: y(Math.max(trailEnd.total_raised, trailEnd.total_raised + raisedSlope * targetDays)),
    };
    closedProjected = {
      x: x(xEndDate),
      y: y(Math.max(trailEnd.total_closed, trailEnd.total_closed + closedSlope * targetDays)),
    };
  }

  const gapPath =
    raisedPoints.length > 1
      ? `${buildPath(raisedPoints)} L${raisedPoints[raisedPoints.length - 1].x.toFixed(1)},${(
          HEIGHT - PAD_BOTTOM
        ).toFixed(1)} ${buildPath([...closedPoints].reverse()).replace("M", "L")} Z`
      : "";

  const todayX = x(today);
  const hovered = hoverIdx !== null ? sorted[hoverIdx] : null;

  function onMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let closest = 0;
    let closestDist = Infinity;
    sorted.forEach((s, i) => {
      const d = Math.abs(x(s.snapshot_date) - svgX);
      if (d < closestDist) {
        closestDist = d;
        closest = i;
      }
    });
    setHoverIdx(closest);
  }

  return (
    <div className="relative rounded-card border border-border bg-card p-3">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[9px] uppercase tracking-[0.07em] text-faint">Burn-up</span>
        <span className="text-[10px] text-muted-foreground">Hover for daily figures</span>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="block w-full"
        role="img"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <title>Burn-up chart</title>
        <desc>Cumulative raised and closed lines; the shaded gap is the open count.</desc>
        <g stroke="#F7EAE6">
          <line x1={PAD_LEFT} y1={y(yMax * 0.33)} x2={WIDTH - PAD_RIGHT} y2={y(yMax * 0.33)} />
          <line x1={PAD_LEFT} y1={y(yMax * 0.66)} x2={WIDTH - PAD_RIGHT} y2={y(yMax * 0.66)} />
        </g>
        {gapPath && <path d={gapPath} fill="#FBE4DE" opacity={0.6} />}
        <path d={buildPath(raisedPoints)} fill="none" stroke="#C75B4E" strokeWidth={2.5} />
        <path d={buildPath(closedPoints)} fill="none" stroke="#6E9CA6" strokeWidth={2.5} />
        {raisedProjected && (
          <path
            d={`M${raisedPoints[raisedPoints.length - 1].x},${raisedPoints[raisedPoints.length - 1].y} L${raisedProjected.x},${raisedProjected.y}`}
            fill="none"
            stroke="#C75B4E"
            strokeWidth={2}
            strokeDasharray="5 4"
            opacity={0.55}
          />
        )}
        {closedProjected && (
          <path
            d={`M${closedPoints[closedPoints.length - 1].x},${closedPoints[closedPoints.length - 1].y} L${closedProjected.x},${closedProjected.y}`}
            fill="none"
            stroke="#6E9CA6"
            strokeWidth={2}
            strokeDasharray="5 4"
            opacity={0.55}
          />
        )}
        <line x1={todayX} y1={PAD_TOP} x2={todayX} y2={HEIGHT - PAD_BOTTOM} stroke="#D3C4BE" strokeDasharray="3 4" />
        <text x={todayX + 4} y={PAD_TOP + 8} fontSize={9} fill="var(--faint)">
          today
        </text>
        <text x={PAD_LEFT + 4} y={raisedPoints[0].y - 4} fontSize={9} fill="#C75B4E">
          raised
        </text>
        <text x={PAD_LEFT + 4} y={closedPoints[0].y + 12} fontSize={9} fill="#6E9CA6">
          closed
        </text>

        {hovered && (
          <g pointerEvents="none">
            <line
              x1={x(hovered.snapshot_date)}
              y1={PAD_TOP}
              x2={x(hovered.snapshot_date)}
              y2={HEIGHT - PAD_BOTTOM}
              stroke="#2E2422"
              strokeWidth={1}
              opacity={0.3}
            />
            <circle cx={x(hovered.snapshot_date)} cy={y(hovered.total_raised)} r={4} fill="#C75B4E" stroke="#fff" strokeWidth={1.5} />
            <circle cx={x(hovered.snapshot_date)} cy={y(hovered.total_closed)} r={4} fill="#6E9CA6" stroke="#fff" strokeWidth={1.5} />
          </g>
        )}

        <rect
          x={PAD_LEFT}
          y={PAD_TOP - 4}
          width={WIDTH - PAD_LEFT - PAD_RIGHT}
          height={HEIGHT - PAD_TOP - PAD_BOTTOM + 4}
          fill="transparent"
          onMouseMove={onMove}
          style={{ cursor: "crosshair" }}
        />
      </svg>

      {hovered && (
        <div className="pointer-events-none absolute rounded-md bg-foreground px-2 py-1 text-[10px] leading-relaxed text-background shadow-md"
          style={{ left: `${(x(hovered.snapshot_date) / WIDTH) * 100}%`, top: 28, transform: "translateX(-50%)" }}
        >
          <div className="font-mono">{fmtShort(hovered.snapshot_date)}{hovered.snapshot_date === today ? " (today)" : ""}</div>
          <div>Raised: {hovered.total_raised} · Closed: {hovered.total_closed}</div>
        </div>
      )}

      <div className="mt-1 flex justify-between text-[9px] text-faint">
        {weekTicks.map((d) => (
          <span key={d} className={d === today ? "font-medium text-muted-foreground" : undefined}>
            {fmtShort(d)}
          </span>
        ))}
        {hasTarget && <span>go-live {fmtShort(xEndDate)}</span>}
      </div>
    </div>
  );
}
```

#### `src/components/duplicate-check-modal.tsx`

```tsx
import { Button } from "@/components/ui/button";
import { STATUS_CHIP, STATUS_LABELS } from "@/lib/snags";
import type { DuplicateCandidate } from "@/app/(app)/warehouses/[id]/snags/new/actions";

// PLAN.md §7: candidates ranked by description similarity within the same
// warehouse/location/sub-category, shown before the snag is written.
export function DuplicateCheckModal({
  candidates,
  pending,
  onCancel,
  onRaiseAnyway,
}: {
  candidates: DuplicateCandidate[];
  pending: boolean;
  onCancel: () => void;
  onRaiseAnyway: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-card border border-border bg-card p-4">
        <h2 className="text-[14px] font-medium text-foreground">Possible duplicate</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          {candidates.length === 1 ? "This looks similar to an" : "These look similar to"} open snag
          {candidates.length === 1 ? "" : "s"} already raised at this location.
        </p>
        <div className="mt-3 flex max-h-64 flex-col gap-2 overflow-y-auto">
          {candidates.map((c) => (
            <div key={c.id} className="rounded-md border border-border p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10.5px] text-faint">#{String(c.serial_no).padStart(3, "0")}</span>
                <span className={`rounded-chip px-1.5 py-0.5 text-[10px] font-medium ${STATUS_CHIP[c.status]}`}>
                  {STATUS_LABELS[c.status] ?? c.status}
                </span>
              </div>
              <p className="mt-1 text-[12.5px] text-foreground">{c.description}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Raised by {c.raised_by_name ?? "—"}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            Cancel — it&apos;s the same issue
          </Button>
          <Button type="button" disabled={pending} onClick={onRaiseAnyway}>
            {pending ? "Raising…" : "Raise anyway"}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

#### `src/components/export-button.tsx`

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { exportSnagsToExcel } from "@/lib/excel";
import type { SnagRow } from "@/components/snag-table";

export function ExportButton({ snags, warehouseName }: { snags: SnagRow[]; warehouseName: string }) {
  const [busy, setBusy] = useState(false);

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await exportSnagsToExcel(snags, warehouseName);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Exporting…" : "Export"}
    </Button>
  );
}
```

#### `src/components/multi-select-filter.tsx`

```tsx
"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  className,
  emptySuffix = ": All",
  onSelectAll,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  className?: string;
  // Table filters read correctly as "Status: All" when nothing's picked —
  // no filter means every row matches. That's not true everywhere this
  // component is reused (e.g. an invite form, where nothing picked means
  // no warehouse tag at all, not "all warehouses") — callers there should
  // pass "" so the button just reads as a plain placeholder.
  emptySuffix?: string;
  // Opt-in "select everything" shortcut, styled and positioned like Clear
  // rather than as one more checkbox in the list — it's a bulk action on
  // the selection, not itself a selectable value.
  onSelectAll?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Rendered through a portal (below) rather than as a normal absolutely-
  // positioned child — this component gets used inside containers that
  // clip overflow for rounded corners (e.g. the People table), which would
  // otherwise cut the open dropdown off instead of letting it float over
  // the page.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    function updatePosition() {
      const rect = triggerRef.current!.getBoundingClientRect();
      // Flip above the trigger when there isn't room below (e.g. the last
      // row in a table near the bottom of the page) but there's more room
      // above — panelRef already has its real rendered height at this
      // point since layout effects run after the portal's DOM is
      // committed, so this doesn't need a guessed/max height.
      const panelHeight = panelRef.current?.offsetHeight ?? 0;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < panelHeight + 8 && rect.top > spaceBelow;
      const top = openUpward ? rect.top - 4 - panelHeight : rect.bottom + 4;
      setPosition({ top, left: rect.left, width: rect.width });
    }
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        panelRef.current &&
        !panelRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`rounded-md border px-2 py-1 text-[11.5px] font-medium ${
          selected.length > 0
            ? "border-primary bg-accent text-accent-foreground"
            : "border-teal bg-frost text-teal-deep"
        } ${className ?? ""}`}
      >
        {label}
        {selected.length > 0 ? ` (${selected.length})` : emptySuffix}
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: position.top, left: position.left, minWidth: position.width }}
            className="fixed z-50 max-h-56 w-44 overflow-y-auto rounded-md border border-border bg-card py-1 shadow-md"
          >
            {onSelectAll && selected.length < options.length && (
              <button
                type="button"
                onClick={onSelectAll}
                className="w-full px-2.5 py-1 text-left text-[11px] text-primary hover:bg-muted"
              >
                All
              </button>
            )}
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full px-2.5 py-1 text-left text-[11px] text-primary hover:bg-muted"
              >
                Clear
              </button>
            )}
            {options.map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[12px] hover:bg-muted"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(o.value)}
                  onChange={() => toggle(o.value)}
                  className="accent-primary"
                />
                {o.label}
              </label>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
```

#### `src/components/pending-sync-banner.tsx`

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listQueuedSnags } from "@/lib/offline-queue";
import { syncOfflineQueue } from "@/lib/sync-queue";

export function PendingSyncBanner() {
  const router = useRouter();
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshCount = useCallback(async () => {
    const queue = await listQueuedSnags();
    setPending(queue.length);
  }, []);

  const trySync = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    const result = await syncOfflineQueue();
    setSyncing(false);
    setError(result.error);
    await refreshCount();
    if (result.synced.length > 0) router.refresh();
  }, [refreshCount, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshCount();
    trySync();
    window.addEventListener("online", trySync);
    return () => window.removeEventListener("online", trySync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (pending === 0) return null;

  return (
    <div className="flex items-center gap-2 border-b border-amber bg-amber px-4 py-1.5 text-[12px] text-amber-deep">
      <span>
        {pending} snag{pending === 1 ? "" : "s"} queued offline — will sync automatically once you&apos;re back
        online.
      </span>
      <button
        type="button"
        onClick={trySync}
        disabled={syncing}
        className="ml-auto font-medium underline-offset-2 hover:underline"
      >
        {syncing ? "Syncing…" : "Sync now"}
      </button>
      {error && <span className="text-destructive">{error}</span>}
    </div>
  );
}
```

#### `src/components/photo-capture.tsx`

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { buildThumbnail, loadImageToCanvas, type PhotoCapture } from "@/lib/media";

// Canvas overlay for circling the defect before save, per PLAN.md §6.
// The original (pristine) image is always preserved separately from the
// annotated version.
export function PhotoCaptureInput({ onChange }: { onChange: (capture: PhotoCapture | null) => void }) {
  const pristineRef = useRef<HTMLCanvasElement | null>(null);
  const visibleRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef<{ x: number; y: number } | null>(null);
  const [hasImage, setHasImage] = useState(false);
  const [hasAnnotation, setHasAnnotation] = useState(false);
  const [busy, setBusy] = useState(false);

  // The <canvas> only mounts once hasImage flips true, so the first
  // draw has to happen in an effect (after commit), not inline in the
  // file-select handler where the ref is still null.
  useEffect(() => {
    if (hasImage) {
      redraw();
      emit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasImage]);

  async function onFileSelected(file: File) {
    setBusy(true);
    try {
      const canvas = await loadImageToCanvas(file);
      pristineRef.current = canvas;
      setHasAnnotation(false);
      setHasImage(true);
    } finally {
      setBusy(false);
    }
  }

  function redraw() {
    const pristine = pristineRef.current;
    const visible = visibleRef.current;
    if (!pristine || !visible) return;
    visible.width = pristine.width;
    visible.height = pristine.height;
    visible.getContext("2d")!.drawImage(pristine, 0, 0);
  }

  function drawCircle(x0: number, y0: number, x1: number, y1: number) {
    redraw();
    const ctx = visibleRef.current!.getContext("2d")!;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const rx = Math.abs(x1 - x0) / 2;
    const ry = Math.abs(y1 - y0) / 2;
    ctx.strokeStyle = "#C75B4E";
    ctx.lineWidth = Math.max(3, visibleRef.current!.width / 200);
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(rx, 4), Math.max(ry, 4), 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  function toCanvasCoords(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = visibleRef.current!.getBoundingClientRect();
    const scaleX = visibleRef.current!.width / rect.width;
    const scaleY = visibleRef.current!.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  async function emit() {
    const pristine = pristineRef.current;
    const visible = visibleRef.current;
    if (!pristine || !visible) {
      onChange(null);
      return;
    }
    const [original, annotated, thumbnail] = await Promise.all([
      new Promise<Blob>((res, rej) => pristine.toBlob((b) => (b ? res(b) : rej()), "image/jpeg", 0.85)),
      new Promise<Blob>((res, rej) => visible.toBlob((b) => (b ? res(b) : rej()), "image/jpeg", 0.85)),
      buildThumbnail(visible),
    ]);
    onChange({ original, annotated, thumbnail });
  }

  return (
    <div>
      {!hasImage ? (
        <label className="flex h-14 cursor-pointer items-center justify-center rounded-md border border-dashed border-input text-[13px] text-muted-foreground hover:bg-muted">
          {busy ? "Loading…" : "Take or add a photo"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFileSelected(e.target.files[0])}
          />
        </label>
      ) : (
        <div>
          <canvas
            ref={visibleRef}
            className="w-full cursor-crosshair rounded-md border border-border"
            onMouseDown={(e) => {
              draggingRef.current = toCanvasCoords(e);
            }}
            onMouseMove={(e) => {
              if (!draggingRef.current) return;
              const { x, y } = toCanvasCoords(e);
              drawCircle(draggingRef.current.x, draggingRef.current.y, x, y);
            }}
            onMouseUp={async () => {
              if (draggingRef.current) {
                setHasAnnotation(true);
                await emit();
              }
              draggingRef.current = null;
            }}
          />
          <div className="mt-1.5 flex items-center gap-2 text-[11.5px]">
            <span className="text-muted-foreground">Drag on the photo to circle the defect.</span>
            {hasAnnotation && (
              <button
                type="button"
                className="text-primary"
                onClick={async () => {
                  redraw();
                  setHasAnnotation(false);
                  await emit();
                }}
              >
                Clear circle
              </button>
            )}
            <button
              type="button"
              className="ml-auto text-destructive"
              onClick={() => {
                pristineRef.current = null;
                setHasImage(false);
                setHasAnnotation(false);
                onChange(null);
              }}
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PhotoChip({ thumbnail, onRemove }: { thumbnail: Blob; onRemove: () => void }) {
  const [url] = useState(() => URL.createObjectURL(thumbnail));
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="h-full w-full object-cover" />
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-bl-md bg-destructive text-[10px] text-white"
      >
        ×
      </button>
    </div>
  );
}

// Wraps the single-shot editor above to build a list. PhotoCaptureInput's
// onChange fires repeatedly while one photo is being annotated (each drag
// re-emits the updated blobs), so appending straight from onChange would
// duplicate entries — this tracks the in-progress photo as a draft and only
// commits it to the list on an explicit "Add" tap, then remounts a fresh
// picker (via key) for the next one.
export function MultiPhotoCaptureInput({ onChange }: { onChange: (captures: PhotoCapture[]) => void }) {
  const [captures, setCaptures] = useState<PhotoCapture[]>([]);
  const [draft, setDraft] = useState<PhotoCapture | null>(null);
  const [pickerKey, setPickerKey] = useState(0);

  function addDraft() {
    if (!draft) return;
    const next = [...captures, draft];
    setCaptures(next);
    onChange(next);
    setDraft(null);
    setPickerKey((k) => k + 1);
  }

  function removeCapture(index: number) {
    const next = captures.filter((_, i) => i !== index);
    setCaptures(next);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {captures.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {captures.map((c, i) => (
            <PhotoChip key={i} thumbnail={c.thumbnail} onRemove={() => removeCapture(i)} />
          ))}
        </div>
      )}
      <PhotoCaptureInput key={pickerKey} onChange={setDraft} />
      {draft && (
        <button
          type="button"
          onClick={addDraft}
          className="self-start text-[11.5px] font-medium text-primary hover:underline"
        >
          + Add this photo
        </button>
      )}
    </div>
  );
}
```

#### `src/components/role-people-picker.tsx`

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { ROLE_COLOR_CLASS, type MemberRole } from "@/lib/roles";

type Person = { id: string; full_name: string | null; email: string; default_role?: string | null };

function displayName(p: Person) {
  return p.full_name ?? p.email;
}

// Searchable multi-select combobox: selected people show as colored chips
// (colored by role, per the shared ROLE_COLOR_CLASS mapping), with a
// dropdown search box for adding more.
export function RolePeoplePicker({
  role,
  label,
  people,
  selected,
  onChange,
  lockedIds = [],
  onRemoveLocked,
}: {
  role: MemberRole;
  label: string;
  people: Person[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Already-a-member ids shown as locked chips (add-only flows unless onRemoveLocked is given). */
  lockedIds?: string[];
  /** When provided, locked chips get a small × to remove that person from this role. */
  onRemoveLocked?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const colorClass = ROLE_COLOR_CLASS[role];

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  const available = people
    .filter((p) => !selected.includes(p.id))
    .filter((p) => displayName(p).toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const aMatch = a.default_role === role ? 0 : 1;
      const bMatch = b.default_role === role ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return displayName(a).localeCompare(displayName(b));
    });

  return (
    <div ref={containerRef} className="relative">
      <div className="mb-1.5 text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">{label}</div>
      <div
        className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5"
        onClick={() => setOpen(true)}
      >
        {selected.map((id) => {
          const p = people.find((x) => x.id === id);
          if (!p) return null;
          const locked = lockedIds.includes(id);
          return locked ? (
            <span key={id} className={`flex items-center gap-1 rounded-pill border px-2 py-0.5 text-[11px] ${colorClass} ${onRemoveLocked ? "" : "opacity-70"}`}>
              {displayName(p)}
              {onRemoveLocked && (
                <button
                  type="button"
                  aria-label={`Remove ${displayName(p)} from ${label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveLocked(id);
                  }}
                  className="text-current opacity-60 hover:opacity-100"
                >
                  ×
                </button>
              )}
            </span>
          ) : (
            <button
              key={id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggle(id);
              }}
              className={`rounded-pill border px-2 py-0.5 text-[11px] ${colorClass}`}
            >
              {displayName(p)} ×
            </button>
          );
        })}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={selected.length === 0 ? "Search or select…" : ""}
          className="min-w-[80px] flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-faint"
        />
      </div>
      {open && (
        <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-md border border-border bg-card shadow-md">
          {available.length === 0 ? (
            <div className="px-2.5 py-2 text-[11.5px] text-muted-foreground">No matches</div>
          ) : (
            available.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  toggle(p.id);
                  setQuery("");
                }}
                className="flex w-full items-center px-2.5 py-1.5 text-left text-[12px] hover:bg-muted"
              >
                {displayName(p)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

#### `src/components/snag-compose.tsx`

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MultiPhotoCaptureInput } from "@/components/photo-capture";
import { MultiVideoCaptureInput } from "@/components/video-capture";
import { createClient } from "@/lib/supabase/client";
import { uploadAttachment, type PhotoCapture, type VideoCapture } from "@/lib/media";
import { postSnagUpdate, closeSnagDirectly, verifySnagClosure } from "@/app/(app)/warehouses/[id]/snag-actions";

async function attachDraftMedia(opts: {
  warehouseId: string;
  snagId: string;
  updateId: string;
  currentUserId: string;
  photos: PhotoCapture[];
  videos: VideoCapture[];
}): Promise<{ error: string | null }> {
  const supabase = createClient();
  for (let i = 0; i < opts.photos.length; i++) {
    const r = await uploadAttachment(supabase, {
      warehouseId: opts.warehouseId,
      snagId: opts.snagId,
      updateId: opts.updateId,
      mediaType: "image",
      file: opts.photos[i].annotated,
      original: opts.photos[i].original,
      thumbnail: opts.photos[i].thumbnail,
      fileName: `snag-photo-${i + 1}.jpg`,
      uploaderId: opts.currentUserId,
    });
    if (r.error) return r;
  }
  for (let i = 0; i < opts.videos.length; i++) {
    const r = await uploadAttachment(supabase, {
      warehouseId: opts.warehouseId,
      snagId: opts.snagId,
      updateId: opts.updateId,
      mediaType: "video",
      file: opts.videos[i].file,
      thumbnail: opts.videos[i].thumbnail,
      fileName: `snag-video-${i + 1}.mp4`,
      uploaderId: opts.currentUserId,
    });
    if (r.error) return r;
  }
  return { error: null };
}

// Reporters raise defects, so their compose box gets the "warm" role badge;
// resolvers drive them to close, so theirs gets the "cool" one — the same
// warm=problem / cool=fix thermal thesis the rest of the palette already
// uses, applied to who's speaking rather than what severity something is.
function StatusControls({
  etc,
  setEtc,
  nextStatus,
  setNextStatus,
}: {
  etc: string;
  setEtc: (v: string) => void;
  nextStatus: string;
  setNextStatus: (v: string) => void;
}) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
        ETC
        <input
          type="date"
          value={etc}
          onChange={(e) => setEtc(e.target.value)}
          className="rounded-md border border-input bg-card px-1.5 py-0.5 text-[11px]"
        />
      </label>
      <select
        value={nextStatus}
        onChange={(e) => setNextStatus(e.target.value)}
        className="rounded-md border border-input bg-card px-1.5 py-0.5 text-[11px]"
      >
        <option value="">Keep status</option>
        <option value="wip">Move to WIP</option>
        <option value="ready_to_close">Ticket closed, verify</option>
      </select>
    </div>
  );
}

export function SnagComposeArea({
  warehouseId,
  snagId,
  status,
  currentUserId,
  hasReporterTag,
  hasResolverTag,
  isDashboardAdmin,
}: {
  warehouseId: string;
  snagId: string;
  status: string;
  currentUserId: string;
  hasReporterTag: boolean;
  hasResolverTag: boolean;
  isDashboardAdmin: boolean;
}) {
  const isPureAdmin = isDashboardAdmin && !hasReporterTag && !hasResolverTag;
  const isDualReal = hasReporterTag && hasResolverTag;
  const router = useRouter();

  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<PhotoCapture[]>([]);
  const [videos, setVideos] = useState<VideoCapture[]>([]);
  const [mediaKey, setMediaKey] = useState(0);
  const [etc, setEtc] = useState("");
  const [nextStatus, setNextStatus] = useState("");
  // For someone tagged both reporter and resolver on this warehouse — which
  // hat they're posting under this message. Not shown at all for a
  // single-role person or a pure (untagged) admin, who each only have one
  // shape of box.
  const [actingAs, setActingAs] = useState<"reporter" | "resolver">(hasReporterTag ? "reporter" : "resolver");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!hasReporterTag && !hasResolverTag && !isDashboardAdmin) return null;

  function resetDraft() {
    setBody("");
    setPhotos([]);
    setVideos([]);
    setEtc("");
    setNextStatus("");
    setMediaKey((k) => k + 1);
  }

  async function afterAction(result: { updateId: string | null; error: string | null }) {
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.updateId && (photos.length > 0 || videos.length > 0)) {
      const r = await attachDraftMedia({ warehouseId, snagId, updateId: result.updateId, currentUserId, photos, videos });
      if (r.error) {
        setError(`Posted, but an attachment failed to upload: ${r.error}`);
        return;
      }
      // The attachment upload happens client-side after postSnagUpdate's own
      // revalidatePath already ran, so without this the new photos/videos
      // wouldn't show up in the feed until some later, unrelated refresh —
      // the text bubble would appear immediately but its attachments
      // wouldn't, even for the person who just sent them.
      router.refresh();
    }
    setError(null);
    resetDraft();
  }

  function send() {
    if (!body.trim()) {
      setError("Add a comment before sending.");
      return;
    }
    const as = isPureAdmin ? "resolver" : isDualReal ? actingAs : hasResolverTag ? "resolver" : "reporter";
    startTransition(async () => {
      const result = await postSnagUpdate(
        warehouseId,
        snagId,
        body,
        as,
        as === "resolver" ? etc || null : null,
        as === "resolver" ? nextStatus || null : null
      );
      await afterAction(result);
    });
  }

  function close() {
    startTransition(async () => {
      const result = await closeSnagDirectly(warehouseId, snagId, body || null);
      await afterAction(result);
    });
  }

  function verify(approved: boolean) {
    startTransition(async () => {
      const result = await verifySnagClosure(warehouseId, snagId, approved, body || null);
      await afterAction(result);
    });
  }

  const showResolverControls =
    isPureAdmin || (isDualReal && actingAs === "resolver") || (!isDualReal && !isPureAdmin && hasResolverTag);
  const showReporterControls =
    isPureAdmin || (isDualReal && actingAs === "reporter") || (!isDualReal && !isPureAdmin && hasReporterTag);

  return (
    <div className="rounded-md border border-border bg-background p-2.5">
      {isPureAdmin && (
        <p className="mb-1.5 text-[10px] uppercase tracking-[0.07em] text-faint">Commenting as Dashboard Admin</p>
      )}
      {isDualReal && (
        <div className="mb-1.5 inline-flex rounded-md border border-border p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setActingAs("reporter")}
            className={`rounded px-2 py-0.5 ${actingAs === "reporter" ? "bg-blush text-red-deep" : "text-muted-foreground"}`}
          >
            Commenting as Reporter
          </button>
          <button
            type="button"
            onClick={() => setActingAs("resolver")}
            className={`rounded px-2 py-0.5 ${actingAs === "resolver" ? "bg-frost text-teal-deep" : "text-muted-foreground"}`}
          >
            Commenting as Resolver
          </button>
        </div>
      )}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Add a comment"
        className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-[12.5px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />

      <div key={mediaKey} className="mt-1.5 flex flex-col gap-1.5 sm:flex-row">
        <div className="flex-1">
          <MultiPhotoCaptureInput onChange={setPhotos} />
        </div>
        <div className="flex-1">
          <MultiVideoCaptureInput onChange={setVideos} />
        </div>
      </div>

      {showResolverControls && (
        <StatusControls etc={etc} setEtc={setEtc} nextStatus={nextStatus} setNextStatus={setNextStatus} />
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={pending || !body.trim()} onClick={send}>
          {pending ? "Sending…" : "Send"}
        </Button>

        {showReporterControls &&
          (status === "ready_to_close" ? (
            <>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => verify(false)}>
                Reject — reopen
              </Button>
              <Button size="sm" disabled={pending} onClick={() => verify(true)}>
                Confirm closed
              </Button>
            </>
          ) : status !== "closed" ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={close}>
              Close ticket
            </Button>
          ) : null)}
      </div>
      {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
```

#### `src/components/snag-row.tsx`

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  CATEGORY_LABELS,
  LOCATION_LABELS,
  SCOPE_LABELS,
  SEVERITY_CHIP,
  SEVERITY_LABELS,
  STATUS_CHIP,
  STATUS_LABELS,
  SUB_CATEGORY_LABELS,
  ageingClass,
  ageingDays,
  isOverdue,
} from "@/lib/snags";
import type { SnagRow as SnagRowData } from "@/components/snag-table";
import { SnagComposeArea } from "@/components/snag-compose";
import { cn } from "@/lib/utils";
import { STICKY_SNO_CLASS, STICKY_DATE_CLASS, STICKY_DESC_CLASS } from "@/lib/table-sticky";

export type UpdateRow = {
  id: string;
  body: string;
  author_id: string;
  author_side: "reporter" | "resolver" | "admin";
  created_at: string;
  author: { full_name: string | null; email: string } | null;
};

export type AttachmentRow = {
  id: string;
  update_id: string | null;
  media_type: string;
  thumbnail_url: string;
  file_url: string;
};

export type ActivityRow = {
  id: string;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  actor: { full_name: string | null; email: string } | null;
};

function describeActivity(a: ActivityRow): string {
  switch (a.action) {
    case "raise":
      return "raised this snag";
    case "status_change":
      return `moved status from ${STATUS_LABELS[a.old_value ?? ""] ?? a.old_value ?? "—"} to ${
        STATUS_LABELS[a.new_value ?? ""] ?? a.new_value ?? "—"
      }`;
    case "etc_update":
      return a.old_value
        ? `updated ETC from ${fmtDate(a.old_value)} to ${a.new_value ? fmtDate(a.new_value) : "—"}`
        : `set ETC to ${a.new_value ? fmtDate(a.new_value) : "—"}`;
    case "verify_closure":
      return "closed this snag";
    case "reject_closure":
      return "reopened this snag";
    case "duplicate_suppressed":
      return "raised this snag despite a possible duplicate match";
    case "correct_date_raised":
      return `corrected the raised date from ${a.old_value ? fmtDate(a.old_value) : "—"} to ${
        a.new_value ? fmtDate(a.new_value) : "—"
      }`;
    default:
      return a.action.replaceAll("_", " ");
  }
}

function AttachmentThumbs({ attachments }: { attachments: AttachmentRow[] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {attachments.map((a) => (
        <a
          key={a.id}
          href={a.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="relative block h-14 w-14 overflow-hidden rounded-md border border-border"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.thumbnail_url} alt="" className="h-full w-full object-cover" />
          {a.media_type === "video" && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-[16px] text-white">
              ▶
            </span>
          )}
        </a>
      ))}
    </div>
  );
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

// Time before date, per feedback — "14:57 · 12 Aug" reads as a log entry
// timestamp, matching how the format is used elsewhere in the feed.
function fmtTimeDate(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  return `${time} · ${date}`;
}

const SIDE_LABEL: Record<string, string> = {
  reporter: "Reporter",
  resolver: "Resolver",
  admin: "Dashboard Admin",
};

// A message shows the author's actual current operational role(s) on this
// warehouse (e.g. "HVAC Engineer") when they're tagged with one — real role
// always wins over any bucket label, since the bucket is about which side
// of the thread a message sits on, not a description of the person. Next,
// "Dashboard Admin" if they hold no tag here but are a real admin (this
// matters most for the raise bubble, which always sits on the reporter
// side even when an admin bypassed to raise it — the badge should still
// say what they actually are). The generic reporter/resolver bucket is
// only a last resort, for someone with neither a current tag nor admin
// status (e.g. fully removed from the org, message kept for the record).
function roleTextFor(
  side: "reporter" | "resolver" | "admin",
  authorId: string,
  rolesByUserId: Record<string, string[]>,
  adminUserIds: string[]
) {
  const roles = rolesByUserId[authorId];
  if (roles && roles.length > 0) return roles.join(", ");
  if (adminUserIds.includes(authorId)) return "Dashboard Admin";
  return SIDE_LABEL[side];
}

// Reporters raise defects (the problem), resolvers drive them to close (the
// fix) — reusing the palette's own warm/cool thermal thesis for who's
// speaking, not just severity, keeps the two sides visually distinct
// without introducing a new accent. The message box itself carries the same
// tint now, not just the name badge.
const SIDE_BADGE_CLASS: Record<string, string> = {
  reporter: "bg-blush text-red-deep",
  resolver: "bg-frost text-teal-deep",
  admin: "bg-line-soft text-foreground",
};

const SIDE_BOX_CLASS: Record<string, string> = {
  reporter: "border-blush bg-blush",
  resolver: "border-frost bg-frost",
  admin: "border-line-soft bg-line-soft",
};

const SIDE_JUSTIFY_CLASS: Record<string, string> = {
  reporter: "justify-start",
  resolver: "justify-end",
  admin: "justify-center",
};

const SIDE_ITEMS_CLASS: Record<string, string> = {
  reporter: "items-start",
  resolver: "items-end",
  admin: "items-center",
};

function ChatBubble({
  side,
  authorName,
  roleText,
  body,
  attachments,
  timestamp,
}: {
  side: "reporter" | "resolver" | "admin";
  authorName: string;
  roleText: string;
  body: string;
  attachments: AttachmentRow[];
  timestamp: string;
}) {
  // A row wrapper positions the bubble via justify-content, with the bubble
  // itself sized to its content (capped at 85%) as a flex-row child — a
  // max-w column div with mx-auto/mr-auto looked right for reporter/resolver
  // by coincidence (they hug an edge either way) but silently mis-centered
  // admin's bubble, since a flex-col item stretches to fill the cross axis
  // by default and auto-margins had no slack left to distribute.
  return (
    <div className={cn("flex", SIDE_JUSTIFY_CLASS[side])}>
      <div className={cn("flex max-w-[85%] flex-col gap-0.5", SIDE_ITEMS_CLASS[side])}>
        <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
          <span className="font-mono text-faint">{timestamp}</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-medium text-foreground">{authorName}</span>
          <span className={cn("rounded-chip px-1.5 py-0.5 text-[9px] font-medium", SIDE_BADGE_CLASS[side])}>
            {roleText}
          </span>
        </div>
        <div
          className={cn(
            "whitespace-normal rounded-md border px-2.5 py-1.5 text-[12px] text-foreground",
            SIDE_BOX_CLASS[side]
          )}
        >
          {body}
          {attachments.length > 0 && (
            <div className="mt-1.5">
              <AttachmentThumbs attachments={attachments} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SystemLine({ actorName, text, timestamp }: { actorName: string; text: string; timestamp: string }) {
  return (
    <div className="text-center text-[10.5px] text-muted-foreground">
      <span className="font-mono text-faint">{timestamp}</span> · {actorName} {text}
    </div>
  );
}

type FeedItem =
  | {
      kind: "message";
      id: string;
      side: "reporter" | "resolver" | "admin";
      authorName: string;
      roleText: string;
      body: string;
      attachments: AttachmentRow[];
      createdAt: string;
    }
  | { kind: "system"; id: string; actorName: string; text: string; createdAt: string };

function buildFeed(
  s: SnagRowData,
  updates: UpdateRow[],
  snagPhotos: AttachmentRow[],
  attachmentsByUpdate: Map<string, AttachmentRow[]>,
  activity: ActivityRow[],
  rolesByUserId: Record<string, string[]>,
  adminUserIds: string[]
): FeedItem[] {
  const items: FeedItem[] = [];

  // The raise itself is always the thread's opening message — it always
  // comes from the reporter side, even when a Dashboard Admin bypassing
  // without a reporter tag is the one who clicked it.
  const raiseActivity = activity.find((a) => a.action === "raise");
  items.push({
    kind: "message",
    id: `raise-${s.id}`,
    side: "reporter",
    authorName: s.raised_by_profile?.full_name ?? s.raised_by_profile?.email ?? "Someone",
    roleText: roleTextFor("reporter", s.raised_by, rolesByUserId, adminUserIds),
    body: s.description,
    attachments: snagPhotos,
    createdAt: raiseActivity?.created_at ?? `${s.date_raised}T00:00:00`,
  });

  for (const u of updates) {
    items.push({
      kind: "message",
      id: u.id,
      side: u.author_side,
      authorName: u.author?.full_name ?? u.author?.email ?? "Someone",
      roleText: roleTextFor(u.author_side, u.author_id, rolesByUserId, adminUserIds),
      body: u.body,
      attachments: attachmentsByUpdate.get(u.id) ?? [],
      createdAt: u.created_at,
    });
  }

  for (const a of activity) {
    if (a.action === "raise") continue;
    items.push({
      kind: "system",
      id: a.id,
      actorName: a.actor?.full_name ?? a.actor?.email ?? "Someone",
      text: describeActivity(a),
      createdAt: a.created_at,
    });
  }

  items.sort((x, y) => new Date(x.createdAt).getTime() - new Date(y.createdAt).getTime());
  return items;
}

export function SnagRow({
  snag: s,
  updates,
  attachments,
  activity,
  warehouseId,
  hasReporterTag,
  hasResolverTag,
  isDashboardAdmin,
  rolesByUserId,
  adminUserIds,
  currentUserId,
}: {
  snag: SnagRowData;
  updates: UpdateRow[];
  attachments: AttachmentRow[];
  activity: ActivityRow[];
  warehouseId: string;
  hasReporterTag: boolean;
  hasResolverTag: boolean;
  isDashboardAdmin: boolean;
  rolesByUserId: Record<string, string[]>;
  adminUserIds: string[];
  currentUserId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  // Measures the table's own scroll container so the panel below can match
  // its exact visible width — confined to the screen and dynamic across
  // breakpoints/sidebar-collapse, not a guessed fixed pixel cap.
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState<number | null>(null);
  const snagPhotos = attachments.filter((a) => a.update_id === null);
  const attachmentsByUpdate = new Map<string, AttachmentRow[]>();
  for (const a of attachments) {
    if (a.update_id) attachmentsByUpdate.set(a.update_id, [...(attachmentsByUpdate.get(a.update_id) ?? []), a]);
  }
  const days = ageingDays(s.date_raised, s.closed_at);
  const overdue = isOverdue(s.etc_date, s.status);
  const subCategory =
    s.sub_category === "others" && s.sub_category_other
      ? s.sub_category_other
      : SUB_CATEGORY_LABELS[s.sub_category] ?? s.sub_category;
  const latest = updates[updates.length - 1];

  // Expanding scrolls the table back to the frozen columns so the panel
  // opens on screen — the panel itself then stays put via position:sticky
  // (see the wrapper below) however far the table gets scrolled after that.
  function toggleExpanded(e: React.MouseEvent<HTMLTableRowElement>) {
    const container = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-slot="table-container"]');
    setExpanded((v) => {
      const next = !v;
      if (next && container) container.scrollLeft = 0;
      return next;
    });
  }

  // container.clientWidth is the scroll container's *visible* width — it
  // already accounts for the sidebar's current state, page padding, and the
  // viewport size, so tracking it (via ResizeObserver, for window resizes
  // and sidebar expand/collapse alike) gives the panel the exact width of
  // the screen area actually available, not an approximation of it.
  useEffect(() => {
    if (!expanded) return;
    const container = panelRef.current?.closest<HTMLElement>('[data-slot="table-container"]');
    if (!container) return;
    const update = () => setPanelWidth(container.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [expanded]);

  const feed = buildFeed(s, updates, snagPhotos, attachmentsByUpdate, activity, rolesByUserId, adminUserIds);

  return (
    <>
      <TableRow className="group cursor-pointer" onClick={toggleExpanded}>
        <TableCell className={cn(STICKY_SNO_CLASS, "font-mono text-[11px] text-muted-foreground")}>
          {String(s.serial_no).padStart(3, "0")}
        </TableCell>
        <TableCell className={cn(STICKY_DATE_CLASS, "whitespace-nowrap font-mono text-[11px] text-muted-foreground")}>
          {fmtDate(s.date_raised)}
        </TableCell>
        <TableCell className={cn(STICKY_DESC_CLASS, "text-[12.5px] text-foreground")}>
          {s.description}
        </TableCell>
        <TableCell className="max-w-[130px] truncate whitespace-nowrap text-[12px]">
          {s.raised_by_profile?.full_name ?? s.raised_by_profile?.email ?? "—"}
        </TableCell>
        <TableCell className="whitespace-nowrap text-[12px] text-muted-foreground">
          {CATEGORY_LABELS[s.category] ?? s.category}
        </TableCell>
        <TableCell className="whitespace-nowrap text-[12px] text-muted-foreground">{subCategory}</TableCell>
        <TableCell className="whitespace-nowrap text-[12px] text-muted-foreground">
          {LOCATION_LABELS[s.location] ?? s.location}
        </TableCell>
        <TableCell className="whitespace-nowrap text-[12px] text-muted-foreground">
          {SCOPE_LABELS[s.scope] ?? s.scope}
        </TableCell>
        <TableCell className="text-center">
          <span className={`rounded-chip px-1.5 py-0.5 text-[10px] font-medium ${SEVERITY_CHIP[s.severity]}`}>
            {SEVERITY_LABELS[s.severity] ?? s.severity}
          </span>
        </TableCell>
        <TableCell className="text-center">
          <span className={`rounded-chip px-1.5 py-0.5 text-[10px] font-medium ${STATUS_CHIP[s.status]}`}>
            {STATUS_LABELS[s.status] ?? s.status}
          </span>
        </TableCell>
        <TableCell className="w-[380px] min-w-[380px] max-w-[380px] whitespace-normal break-words text-[11px]">
          {latest ? (
            <>
              <div className="text-[11.5px] text-foreground">{latest.body}</div>
              <div className="font-mono text-[9.5px] text-faint">
                {updates.length} update{updates.length === 1 ? "" : "s"}
              </div>
            </>
          ) : (
            <span className="text-faint">No updates yet</span>
          )}
        </TableCell>
        <TableCell className={`whitespace-nowrap font-mono text-[11px] ${overdue ? "text-red" : "text-muted-foreground"}`}>
          {s.etc_date ? fmtDate(s.etc_date) : "not set"}
        </TableCell>
        <TableCell className={`whitespace-nowrap font-mono text-[11px] ${ageingClass(days)}`}>{days}d</TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={13} className="bg-background p-0">
            {/* Sticks to the left edge of the table's own scroll container
                as it's scrolled horizontally — a colSpan cell can't itself
                be sticky (position:sticky doesn't work on a cell spanning
                the full row width), but a plain block inside a wide cell
                can. Width is measured off that same container (see the
                ResizeObserver above) so the panel always matches the
                actually-visible screen area instead of a guessed cap. */}
            <div
              ref={panelRef}
              className="sticky left-0 z-10 flex w-[90vw] flex-col gap-2.5 border-x-2 border-border bg-background px-3 py-3 shadow-[inset_0_1px_0_0_var(--card)]"
              style={panelWidth ? { width: panelWidth } : undefined}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[9px] font-medium uppercase tracking-[0.07em] text-faint">
                Snag #{s.serial_no} — updates
              </p>
              {feed.map((item) =>
                item.kind === "message" ? (
                  <ChatBubble
                    key={item.id}
                    side={item.side}
                    authorName={item.authorName}
                    roleText={item.roleText}
                    body={item.body}
                    attachments={item.attachments}
                    timestamp={fmtTimeDate(item.createdAt)}
                  />
                ) : (
                  <SystemLine
                    key={item.id}
                    actorName={item.actorName}
                    text={item.text}
                    timestamp={fmtTimeDate(item.createdAt)}
                  />
                )
              )}
              {s.status !== "closed" && (
                <SnagComposeArea
                  warehouseId={warehouseId}
                  snagId={s.id}
                  status={s.status}
                  currentUserId={currentUserId}
                  hasReporterTag={hasReporterTag}
                  hasResolverTag={hasResolverTag}
                  isDashboardAdmin={isDashboardAdmin}
                />
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
```

#### `src/components/snag-table.tsx`

```tsx
"use client";

import { useMemo, useState } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SnagRow, type UpdateRow, type AttachmentRow, type ActivityRow } from "@/components/snag-row";
import { cn } from "@/lib/utils";
import { STICKY_SNO_CLASS, STICKY_DATE_CLASS, STICKY_DESC_CLASS } from "@/lib/table-sticky";
import {
  CATEGORY_LABELS,
  LOCATION_LABELS,
  SCOPE_LABELS,
  SEVERITY_LABELS,
  STATUS_LABELS,
  SUB_CATEGORY_LABELS,
  ageingDays,
} from "@/lib/snags";

export type SnagRow = {
  id: string;
  serial_no: number;
  date_raised: string;
  description: string;
  category: string;
  sub_category: string;
  sub_category_other: string | null;
  location: string;
  scope: string;
  severity: string;
  status: string;
  etc_date: string | null;
  closed_at: string | null;
  raised_by: string;
  raised_by_profile: { full_name: string | null; email: string } | null;
};

const HEADERS = [
  "S.No", "Raised", "Description", "Raised by", "Category", "Sub-category",
  "Location", "Scope", "Severity", "Status", "Update", "ETC", "Age",
];

type SortKey =
  | "serial_no" | "date_raised" | "description" | "raised_by" | "category"
  | "sub_category" | "location" | "scope" | "severity" | "status" | "update"
  | "etc_date" | "age";
type SortDir = "asc" | "desc";

const HEADER_SORT_KEY: Record<string, SortKey> = {
  "S.No": "serial_no",
  "Raised": "date_raised",
  "Description": "description",
  "Raised by": "raised_by",
  "Category": "category",
  "Sub-category": "sub_category",
  "Location": "location",
  "Scope": "scope",
  "Severity": "severity",
  "Status": "status",
  "Update": "update",
  "ETC": "etc_date",
  "Age": "age",
};

// SEVERITY_LABELS/STATUS_LABELS are already declared high→low and
// open→closed, so their key order doubles as the rank a sort should use —
// no separate rank table to keep in sync.
const SEVERITY_RANK = Object.fromEntries(Object.keys(SEVERITY_LABELS).map((k, i) => [k, i]));
const STATUS_RANK = Object.fromEntries(Object.keys(STATUS_LABELS).map((k, i) => [k, i]));

function sortValue(s: SnagRow, key: SortKey, updates: UpdateRow[]): string | number | null {
  switch (key) {
    case "serial_no":
      return s.serial_no;
    case "date_raised":
      return s.date_raised;
    case "description":
      return s.description.toLowerCase();
    case "raised_by":
      return (s.raised_by_profile?.full_name ?? s.raised_by_profile?.email ?? "").toLowerCase();
    case "category":
      return (CATEGORY_LABELS[s.category] ?? s.category).toLowerCase();
    case "sub_category":
      return (
        s.sub_category === "others" && s.sub_category_other
          ? s.sub_category_other
          : SUB_CATEGORY_LABELS[s.sub_category] ?? s.sub_category
      ).toLowerCase();
    case "location":
      return (LOCATION_LABELS[s.location] ?? s.location).toLowerCase();
    case "scope":
      return (SCOPE_LABELS[s.scope] ?? s.scope).toLowerCase();
    case "severity":
      return SEVERITY_RANK[s.severity] ?? 99;
    case "status":
      return STATUS_RANK[s.status] ?? 99;
    case "update": {
      const latest = updates[updates.length - 1];
      return latest ? latest.created_at : null;
    }
    case "etc_date":
      return s.etc_date;
    case "age":
      return ageingDays(s.date_raised, s.closed_at);
  }
}

function SortIcon({ dir }: { dir: SortDir | null }) {
  if (dir === "asc") return <ArrowUp className="size-3" />;
  if (dir === "desc") return <ArrowDown className="size-3" />;
  return <ArrowUpDown className="size-3 opacity-40" />;
}

export function SnagTable({
  snags,
  updatesBySnag,
  attachmentsBySnag,
  activityBySnag,
  warehouseId,
  hasReporterTag,
  hasResolverTag,
  isDashboardAdmin,
  rolesByUserId,
  adminUserIds,
  currentUserId,
}: {
  snags: SnagRow[];
  updatesBySnag: Record<string, UpdateRow[]>;
  attachmentsBySnag: Record<string, AttachmentRow[]>;
  activityBySnag: Record<string, ActivityRow[]>;
  warehouseId: string;
  hasReporterTag: boolean;
  hasResolverTag: boolean;
  isDashboardAdmin: boolean;
  rolesByUserId: Record<string, string[]>;
  adminUserIds: string[];
  currentUserId: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir | null>(null);

  // Third click on the same column resets to the table's normal order
  // (serial_no descending, as fetched) rather than cycling forever.
  function toggleSort(key: SortKey) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey(null);
      setSortDir(null);
    }
  }

  const sortedSnags = useMemo(() => {
    if (!sortKey || !sortDir) return snags;
    const withKeys = snags.map((s) => ({ s, v: sortValue(s, sortKey, updatesBySnag[s.id] ?? []) }));
    withKeys.sort((a, b) => {
      // Nulls (e.g. no ETC set, no updates yet) always sort last,
      // regardless of direction, so they don't jump to the top on desc.
      if (a.v === null) return b.v === null ? 0 : 1;
      if (b.v === null) return -1;
      if (a.v < b.v) return sortDir === "asc" ? -1 : 1;
      if (a.v > b.v) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return withKeys.map((x) => x.s);
  }, [snags, updatesBySnag, sortKey, sortDir]);

  if (snags.length === 0) {
    return (
      <div className="rounded-card border border-border bg-card p-6 text-center text-[13px] text-muted-foreground">
        No snags match this filter.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-card border border-border bg-card pb-2">
      <Table>
        <TableHeader>
          <TableRow>
            {HEADERS.map((h) => {
              const key = HEADER_SORT_KEY[h];
              const dir = sortKey === key ? sortDir : null;
              return (
                <TableHead
                  key={h}
                  className={cn(
                    (h === "Severity" || h === "Status") && "text-center",
                    // Sticky cells paint their own opaque bg-card to hide
                    // content scrolling underneath — override it back to the
                    // header row's fill so they don't show up as a lighter
                    // patch against the rest of the header.
                    h === "S.No" && cn(STICKY_SNO_CLASS, "bg-line"),
                    h === "Raised" && cn(STICKY_DATE_CLASS, "bg-line"),
                    h === "Description" && cn(STICKY_DESC_CLASS, "bg-line"),
                    // Wraps onto multiple lines in the body instead of
                    // truncating, so a fixed width here just bounds the
                    // column rather than clipping the update text.
                    h === "Update" && "w-[380px] min-w-[380px] max-w-[380px]",
                    // Caps long names/emails so one long value doesn't blow
                    // out the column's width relative to the rest of the row.
                    h === "Raised by" && "max-w-[130px]"
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex items-center gap-1",
                      (h === "Severity" || h === "Status") && "justify-center"
                    )}
                  >
                    {h}
                    <button
                      type="button"
                      onClick={() => toggleSort(key)}
                      aria-label={`Sort by ${h}`}
                      className="rounded p-0.5 text-faint hover:bg-muted hover:text-foreground"
                    >
                      <SortIcon dir={dir} />
                    </button>
                  </span>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedSnags.map((s) => (
            <SnagRow
              key={s.id}
              snag={s}
              updates={updatesBySnag[s.id] ?? []}
              attachments={attachmentsBySnag[s.id] ?? []}
              activity={activityBySnag[s.id] ?? []}
              warehouseId={warehouseId}
              hasReporterTag={hasReporterTag}
              hasResolverTag={hasResolverTag}
              isDashboardAdmin={isDashboardAdmin}
              rolesByUserId={rolesByUserId}
              adminUserIds={adminUserIds}
              currentUserId={currentUserId}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

#### `src/components/team-block.tsx`

```tsx
"use client";

import { useState } from "react";
import { MEMBER_ROLES, ROLE_COLOR_CLASS, roleLabel } from "@/lib/roles";

type Member = { role: string; full_name: string | null; email: string };

export function TeamBlock({ members }: { members: Member[] }) {
  const [expanded, setExpanded] = useState(false);

  const byRole = new Map<string, Member[]>();
  for (const m of members) {
    byRole.set(m.role, [...(byRole.get(m.role) ?? []), m]);
  }
  const totalCount = members.length;

  if (totalCount === 0) {
    return (
      <div className="rounded-card border border-border bg-card p-3">
        <div className="mb-1 text-[9px] uppercase tracking-[0.07em] text-faint">Team</div>
        <p className="text-[12px] text-muted-foreground">No one tagged to this warehouse yet.</p>
      </div>
    );
  }

  return (
    <div className="relative rounded-card border border-border bg-card p-3">
      <div className="mb-2 text-[9px] uppercase tracking-[0.07em] text-faint">Team</div>
      {!expanded ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {MEMBER_ROLES.filter((r) => byRole.has(r.value)).map((r) => (
            <span
              key={r.value}
              className={`rounded-pill border px-2 py-0.5 text-[11px] ${ROLE_COLOR_CLASS[r.value]}`}
            >
              {r.label} · {byRole.get(r.value)!.length}
            </span>
          ))}
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="pl-1 text-[12px] text-muted-foreground underline-offset-2 hover:underline"
          >
            Show all {totalCount}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 pr-6">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setExpanded(false)}
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ×
          </button>
          {MEMBER_ROLES.filter((r) => byRole.has(r.value)).map((r) => (
            <div key={r.value} className={`rounded-md border px-2.5 py-1.5 ${ROLE_COLOR_CLASS[r.value]}`}>
              <div className="text-[10.5px] font-medium opacity-80">{roleLabel(r.value)}</div>
              <div className="flex flex-wrap gap-1.5">
                {byRole.get(r.value)!.map((m, i) => (
                  <span key={i} className="text-[12px]">
                    {m.full_name ?? m.email}
                    {i < byRole.get(r.value)!.length - 1 ? "," : ""}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

#### `src/components/thermometer.tsx`

```tsx
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
```

#### `src/components/ui/alert.tsx`

```tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "group/alert relative grid w-full gap-0.5 rounded-lg border px-2.5 py-2 text-left text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        destructive:
          "bg-card text-destructive *:data-[slot=alert-description]:text-destructive/90 *:[svg]:text-current",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "font-medium group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-sm text-balance text-muted-foreground md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
        className
      )}
      {...props}
    />
  )
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn("absolute top-2 right-2", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, AlertAction }
```

#### `src/components/ui/badge.tsx`

```tsx
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
```

#### `src/components/ui/button.tsx`

```tsx
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-teal bg-frost text-teal-deep hover:bg-frost/70 hover:text-teal-deep aria-expanded:bg-frost aria-expanded:text-teal-deep dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
```

#### `src/components/ui/input.tsx`

```tsx
import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
```

#### `src/components/ui/label.tsx`

```tsx
"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
```

#### `src/components/ui/select.tsx`

```tsx
"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"

import { cn } from "@/lib/utils"
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from "lucide-react"

const Select = SelectPrimitive.Root

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1 p-1", className)}
      {...props}
    />
  )
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex flex-1 text-left", className)}
      {...props}
    />
  )
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
        }
      />
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn("relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", className )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-1.5 py-1 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
        }
      >
        <CheckIcon className="pointer-events-none" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronUpIcon
      />
    </SelectPrimitive.ScrollUpArrow>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronDownIcon
      />
    </SelectPrimitive.ScrollDownArrow>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
```

#### `src/components/ui/table.tsx`

```tsx
"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("bg-line [&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle text-[9px] font-semibold uppercase tracking-[0.07em] whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
```

#### `src/components/video-capture.tsx`

```tsx
"use client";

import { useState } from "react";
import {
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  extractVideoThumbnail,
  type VideoCapture,
} from "@/lib/media";

// Hard size/duration cap enforced client-side before upload begins,
// per PLAN.md §6.
export function VideoCaptureInput({ onChange }: { onChange: (capture: VideoCapture | null) => void }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFileSelected(file: File) {
    setError(null);
    if (file.size > MAX_VIDEO_BYTES) {
      setError(`Video is too large (max ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)}MB).`);
      return;
    }
    setBusy(true);
    try {
      const { thumbnail, durationSeconds } = await extractVideoThumbnail(file);
      if (durationSeconds > MAX_VIDEO_SECONDS) {
        setError(`Video is too long (max ${MAX_VIDEO_SECONDS}s, this is ${Math.round(durationSeconds)}s).`);
        return;
      }
      setFileName(file.name);
      onChange({ file, thumbnail, durationSeconds });
    } catch {
      setError("Could not read that video file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {!fileName ? (
        <label className="flex h-14 cursor-pointer items-center justify-center rounded-md border border-dashed border-input text-[13px] text-muted-foreground hover:bg-muted">
          {busy ? "Checking…" : "Attach a video"}
          <input
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFileSelected(e.target.files[0])}
          />
        </label>
      ) : (
        <div className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-[12px]">
          <span className="truncate text-foreground">{fileName}</span>
          <button
            type="button"
            className="ml-2 shrink-0 text-destructive"
            onClick={() => {
              setFileName(null);
              onChange(null);
            }}
          >
            Remove
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

// Wraps the single-shot picker above to build a list, mirroring
// MultiPhotoCaptureInput's draft-then-commit pattern (see there for why —
// video doesn't need it for the same reason since there's no re-editing
// loop, but the two stay symmetric so multi-attach behaves the same way
// for both media types).
export function MultiVideoCaptureInput({ onChange }: { onChange: (captures: VideoCapture[]) => void }) {
  const [captures, setCaptures] = useState<VideoCapture[]>([]);
  const [draft, setDraft] = useState<VideoCapture | null>(null);
  const [pickerKey, setPickerKey] = useState(0);

  function addDraft() {
    if (!draft) return;
    const next = [...captures, draft];
    setCaptures(next);
    onChange(next);
    setDraft(null);
    setPickerKey((k) => k + 1);
  }

  function removeCapture(index: number) {
    const next = captures.filter((_, i) => i !== index);
    setCaptures(next);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {captures.length > 0 && (
        <div className="flex flex-col gap-1">
          {captures.map((c, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-[12px]"
            >
              <span className="text-foreground">{Math.round(c.durationSeconds)}s video</span>
              <button type="button" className="text-destructive" onClick={() => removeCapture(i)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <VideoCaptureInput key={pickerKey} onChange={setDraft} />
      {draft && (
        <button
          type="button"
          onClick={addDraft}
          className="self-start text-[11.5px] font-medium text-primary hover:underline"
        >
          + Add this video
        </button>
      )}
    </div>
  );
}
```

#### `src/components/warehouse-card.tsx`

```tsx
import Link from "next/link";
import { Thermometer } from "@/components/thermometer";
import {
  daysUntil,
  readinessColor,
  type WarehouseReadiness,
} from "@/lib/readiness";
import { cn, CARD_HOVER } from "@/lib/utils";

const BADGE_CLASS: Record<string, string> = {
  red: "bg-blush text-red-deep border-blush",
  amber: "bg-amber text-amber-deep border-amber",
  green: "bg-mint text-mint-deep border-mint",
  grey: "bg-line-soft text-muted-foreground border-line-soft",
};

function badgeText(w: WarehouseReadiness, color: string, days: number | null) {
  if (color === "grey") return "No date";
  if (color === "red" && w.open_high_count > 0) return `${w.open_high_count} high`;
  if (color === "red") return "Overdue";
  if (color === "green") return "On track";
  return days !== null ? `${days} ${days === 1 ? "day" : "days"}` : "";
}

export function WarehouseCard({ w }: { w: WarehouseReadiness }) {
  const color = readinessColor(w);
  const days = daysUntil(w.go_live_date);
  const openPct = w.total_raised > 0 ? Math.round((w.open_count / w.total_raised) * 100) : 0;
  const position = w.total_raised > 0 ? Math.min(98, Math.max(2, openPct)) : null;

  return (
    <Link
      href={`/warehouses/${w.id}`}
      className={cn(CARD_HOVER, "block rounded-card border border-border bg-card p-3.5")}
      style={color === "red" ? { borderColor: "#EFC6BC" } : undefined}
    >
      <div className="flex items-center justify-between">
        <span className="text-[13.5px] font-medium text-foreground">{w.name}</span>
        <span className={`rounded-pill border px-2.5 py-0.5 text-[10.5px] ${BADGE_CLASS[color]}`}>
          {badgeText(w, color, days)}
        </span>
      </div>
      <div className="font-mono mb-2.5 mt-0.5 text-[10px] text-faint">
        {w.go_live_date
          ? `GO-LIVE ${new Date(w.go_live_date + "T00:00:00").toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            }).toUpperCase()}${days !== null ? ` · ${days} DAYS` : ""}`
          : "GO-LIVE NOT SET"}
      </div>
      <Thermometer color={color} position={position} />
      <div className="flex gap-4.5">
        <div>
          <div className={cn("font-mono text-[20px] leading-none", color === "red" && "text-red")}>
            {w.open_count}
          </div>
          <div className="text-[9px] text-faint">open</div>
        </div>
        <div>
          <div className="font-mono text-[20px] leading-none">{w.total_raised}</div>
          <div className="text-[9px] text-faint">raised</div>
        </div>
        <div>
          <div className="font-mono text-[20px] leading-none">{openPct}%</div>
          <div className="text-[9px] text-faint">open</div>
        </div>
      </div>
    </Link>
  );
}
```

#### `src/lib/excel.ts`

```ts
import ExcelJS from "exceljs";
import {
  CATEGORY_LABELS,
  LOCATION_LABELS,
  SCOPE_LABELS,
  SEVERITY_LABELS,
  STATUS_LABELS,
  SUB_CATEGORY_LABELS,
  ageingDays,
  isOverdue,
} from "@/lib/snags";
import type { SnagRow } from "@/components/snag-table";

function downloadBuffer(buffer: ArrayBuffer, fileName: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function reverseLookup(labels: Record<string, string>, input: string): string | null {
  const needle = input.trim().toLowerCase();
  const entry = Object.entries(labels).find(([, label]) => label.toLowerCase() === needle);
  return entry ? entry[0] : null;
}

// PLAN.md §8: current filtered view to .xlsx, all columns plus ageing and
// the overdue flag.
export async function exportSnagsToExcel(snags: SnagRow[], warehouseName: string) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Snags");

  sheet.columns = [
    { header: "S.No", key: "serial_no", width: 8 },
    { header: "Date Raised", key: "date_raised", width: 13 },
    { header: "Raised By", key: "raised_by", width: 22 },
    { header: "Description", key: "description", width: 45 },
    { header: "Category", key: "category", width: 10 },
    { header: "Sub-category", key: "sub_category", width: 14 },
    { header: "Location", key: "location", width: 16 },
    { header: "Scope", key: "scope", width: 10 },
    { header: "Severity", key: "severity", width: 10 },
    { header: "Status", key: "status", width: 13 },
    { header: "ETC", key: "etc_date", width: 13 },
    { header: "Ageing (days)", key: "ageing", width: 13 },
    { header: "Overdue", key: "overdue", width: 10 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const s of snags) {
    const subCategory =
      s.sub_category === "others" && s.sub_category_other
        ? s.sub_category_other
        : SUB_CATEGORY_LABELS[s.sub_category] ?? s.sub_category;
    sheet.addRow({
      serial_no: s.serial_no,
      date_raised: s.date_raised,
      raised_by: s.raised_by_profile?.full_name ?? s.raised_by_profile?.email ?? "",
      description: s.description,
      category: CATEGORY_LABELS[s.category] ?? s.category,
      sub_category: subCategory,
      location: LOCATION_LABELS[s.location] ?? s.location,
      scope: SCOPE_LABELS[s.scope] ?? s.scope,
      severity: SEVERITY_LABELS[s.severity] ?? s.severity,
      status: STATUS_LABELS[s.status] ?? s.status,
      etc_date: s.etc_date ?? "",
      ageing: ageingDays(s.date_raised, s.closed_at),
      overdue: isOverdue(s.etc_date, s.status) ? "Yes" : "No",
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBuffer(buffer as ArrayBuffer, `${warehouseName.replace(/[^\w-]+/g, "_")}-snags.xlsx`);
}

const IMPORT_HEADERS = [
  "Description",
  "Category",
  "Sub-category",
  "Sub-category Other",
  "Location",
  "Scope",
  "Severity",
] as const;

export async function downloadImportTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Import");

  sheet.columns = IMPORT_HEADERS.map((h) => ({ header: h, key: h, width: h === "Description" ? 45 : 20 }));
  sheet.getRow(1).font = { bold: true };

  sheet.addRow({
    Description: "Evaporator fan not coming back on after defrost cycle",
    Category: "HVAC",
    "Sub-category": "ODU",
    "Sub-category Other": "",
    Location: "Frozen chamber",
    Scope: "Infra",
    Severity: "High",
  });

  const notesRow = sheet.addRow({
    Description: "↑ Example row — delete before importing.",
    Category: `Valid: ${Object.values(CATEGORY_LABELS).join(" / ")}`,
    "Sub-category": `Valid: ${Object.values(SUB_CATEGORY_LABELS).join(" / ")}`,
    "Sub-category Other": "Required only when Sub-category is Others",
    Location: `Valid: ${Object.values(LOCATION_LABELS).join(" / ")}`,
    Scope: `Valid: ${Object.values(SCOPE_LABELS).join(" / ")}`,
    Severity: `Valid: ${Object.values(SEVERITY_LABELS).join(" / ")}. High means this stops the warehouse launching.`,
  });
  notesRow.font = { italic: true, color: { argb: "FF8A7A75" } };

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBuffer(buffer as ArrayBuffer, "snag-import-template.xlsx");
}

export type ImportRow = {
  rowNumber: number;
  description: string;
  category: string;
  subCategory: string;
  subCategoryOther: string | null;
  location: string;
  scope: string;
  severity: string;
};

export type ImportRowError = { rowNumber: number; message: string };

export async function parseImportFile(
  file: File
): Promise<{ rows: ImportRow[]; errors: ImportRowError[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];

  const rows: ImportRow[] = [];
  const errors: ImportRowError[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const [description, categoryLabel, subCategoryLabel, subCategoryOther, locationLabel, scopeLabel, severityLabel] =
      [1, 2, 3, 4, 5, 6, 7].map((i) => String(row.getCell(i).value ?? "").trim());

    if (!description && !categoryLabel && !subCategoryLabel) return; // blank row

    // Skip the example/notes rows the template ships with.
    if (description.startsWith("↑ Example row")) return;

    if (!description) {
      errors.push({ rowNumber, message: "Description is required." });
      return;
    }

    const category = reverseLookup(CATEGORY_LABELS, categoryLabel);
    if (!category) {
      errors.push({ rowNumber, message: `"${categoryLabel}" is not a valid Category.` });
      return;
    }
    const subCategory = reverseLookup(SUB_CATEGORY_LABELS, subCategoryLabel);
    if (!subCategory) {
      errors.push({ rowNumber, message: `"${subCategoryLabel}" is not a valid Sub-category.` });
      return;
    }
    if (subCategory === "others" && !subCategoryOther) {
      errors.push({ rowNumber, message: "Sub-category Other is required when Sub-category is Others." });
      return;
    }
    const location = reverseLookup(LOCATION_LABELS, locationLabel);
    if (!location) {
      errors.push({ rowNumber, message: `"${locationLabel}" is not a valid Location.` });
      return;
    }
    const scope = reverseLookup(SCOPE_LABELS, scopeLabel);
    if (!scope) {
      errors.push({ rowNumber, message: `"${scopeLabel}" is not a valid Scope.` });
      return;
    }
    const severity = reverseLookup(SEVERITY_LABELS, severityLabel);
    if (!severity) {
      errors.push({ rowNumber, message: `"${severityLabel}" is not a valid Severity.` });
      return;
    }

    rows.push({
      rowNumber,
      description,
      category,
      subCategory,
      subCategoryOther: subCategory === "others" ? subCategoryOther : null,
      location,
      scope,
      severity,
    });
  });

  return { rows, errors };
}
```

#### `src/lib/media.ts`

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_DIMENSION = 1600;
const THUMB_DIMENSION = 320;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 60;

export type PhotoCapture = {
  original: Blob;
  annotated: Blob;
  thumbnail: Blob;
};

export type VideoCapture = {
  file: Blob;
  thumbnail: Blob;
  durationSeconds: number;
};

function canvasToBlob(canvas: HTMLCanvasElement, type = "image/jpeg", quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("canvas export failed"))), type, quality);
  });
}

function scaledSize(width: number, height: number, maxDim: number) {
  const scale = Math.min(1, maxDim / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// Client-side compression: resize to a sane max dimension and re-encode.
// Matters more than usual here — uploads happen over warehouse wifi from a
// phone in a cold chamber (PLAN.md §6).
export async function loadImageToCanvas(file: File, maxDim = MAX_DIMENSION) {
  const bitmap = await createImageBitmap(file);
  const { width, height } = scaledSize(bitmap.width, bitmap.height, maxDim);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas;
}

export async function buildThumbnail(canvas: HTMLCanvasElement) {
  const { width, height } = scaledSize(canvas.width, canvas.height, THUMB_DIMENSION);
  const thumb = document.createElement("canvas");
  thumb.width = width;
  thumb.height = height;
  thumb.getContext("2d")!.drawImage(canvas, 0, 0, width, height);
  return canvasToBlob(thumb, "image/jpeg", 0.7);
}

export async function extractVideoThumbnail(file: File): Promise<{ thumbnail: Blob; durationSeconds: number }> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("could not read video metadata"));
    });
    video.currentTime = Math.min(0.5, video.duration / 2);
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
    });
    const { width, height } = scaledSize(video.videoWidth, video.videoHeight, THUMB_DIMENSION);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(video, 0, 0, width, height);
    const thumbnail = await canvasToBlob(canvas, "image/jpeg", 0.7);
    return { thumbnail, durationSeconds: video.duration };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function randomId() {
  return crypto.randomUUID().slice(0, 8);
}

export async function uploadAttachment(
  supabase: SupabaseClient,
  opts: {
    warehouseId: string;
    snagId: string;
    updateId?: string | null;
    mediaType: "image" | "video";
    file: Blob;
    original?: Blob;
    thumbnail: Blob;
    fileName: string;
    uploaderId: string;
  }
): Promise<{ error: string | null }> {
  const base = `${opts.warehouseId}/${opts.snagId}/${randomId()}`;
  const ext = opts.mediaType === "image" ? "jpg" : "mp4";

  const uploads: Promise<{ error: Error | null }>[] = [
    supabase.storage.from("attachments").upload(`${base}.${ext}`, opts.file, {
      contentType: opts.mediaType === "image" ? "image/jpeg" : "video/mp4",
    }),
    supabase.storage.from("attachments").upload(`${base}-thumb.jpg`, opts.thumbnail, {
      contentType: "image/jpeg",
    }),
  ];
  if (opts.original) {
    uploads.push(
      supabase.storage.from("attachments").upload(`${base}-original.jpg`, opts.original, {
        contentType: "image/jpeg",
      })
    );
  }

  const results = await Promise.all(uploads);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return { error: failed.error.message };
  }

  const { error } = await supabase.from("attachments").insert({
    snag_id: opts.snagId,
    update_id: opts.updateId ?? null,
    media_type: opts.mediaType,
    file_url: `${base}.${ext}`,
    original_url: opts.original ? `${base}-original.jpg` : null,
    thumbnail_url: `${base}-thumb.jpg`,
    file_name: opts.fileName,
    uploaded_by: opts.uploaderId,
  });

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}
```

#### `src/lib/offline-queue.ts`

```ts
// Offline-first raise queue (PLAN.md §5.7). The client generates the snag's
// id locally since serial_no can only be allocated server-side at sync time
// — the UI shows "pending" until the RPC call actually lands.

const DB_NAME = "snag-offline-queue";
const STORE = "pending-snags";

export type QueuedSnag = {
  localId: string;
  warehouseId: string;
  warehouseName: string;
  description: string;
  category: string;
  subCategory: string;
  subCategoryOther: string | null;
  location: string;
  scope: string;
  severity: string;
  photos: { annotated: Blob; original: Blob; thumbnail: Blob }[];
  createdAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "localId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueSnag(item: QueuedSnag): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listQueuedSnags(): Promise<QueuedSnag[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as QueuedSnag[]);
    req.onerror = () => reject(req.error);
  });
}

export async function removeQueuedSnag(localId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(localId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
```

#### `src/lib/readiness.ts`

```ts
// Launch-readiness gate thresholds (PLAN.md §5.2.1). Named constants so a
// future per-org settings screen can replace these without touching the
// formula itself.
export const OPEN_PCT_THRESHOLD = 0.25;
export const NEAR_LAUNCH_DAYS = 14;

export type WarehouseReadiness = {
  id: string;
  name: string;
  go_live_date: string | null;
  total_raised: number;
  open_count: number;
  open_high_count: number;
};

export type ReadinessColor = "red" | "amber" | "green" | "grey";

export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function readinessColor(w: WarehouseReadiness): ReadinessColor {
  if (!w.go_live_date) return "grey";

  const days = daysUntil(w.go_live_date)!;
  const openPct = w.total_raised > 0 ? w.open_count / w.total_raised : 0;

  if (w.open_high_count > 0 || (days < 0 && w.open_count > 0)) return "red";
  if (openPct > OPEN_PCT_THRESHOLD || (days < NEAR_LAUNCH_DAYS && w.open_count > 0)) return "amber";
  return "green";
}

// Dated warehouses first (soonest go-live first), then undated ones ordered
// by open-snag count descending — an undated site with heavy open work needs
// a date more urgently than a light one (PLAN.md §5.2.2).
export function sortByLaunchProximity(warehouses: WarehouseReadiness[]): WarehouseReadiness[] {
  const dated = warehouses
    .filter((w) => w.go_live_date)
    .sort((a, b) => a.go_live_date!.localeCompare(b.go_live_date!));
  const undated = warehouses
    .filter((w) => !w.go_live_date)
    .sort((a, b) => b.open_count - a.open_count);
  return [...dated, ...undated];
}

export function nextToLaunch(warehouses: WarehouseReadiness[]): WarehouseReadiness | null {
  const candidates = warehouses
    .filter((w) => w.go_live_date && w.open_count > 0)
    .sort((a, b) => a.go_live_date!.localeCompare(b.go_live_date!));
  return candidates[0] ?? null;
}
```

#### `src/lib/roles.ts`

```ts
export const MEMBER_ROLES = [
  { value: "operations", label: "Operations" },
  { value: "hvac_engineer", label: "HVAC Engineer" },
  { value: "program_manager_infra", label: "Program Manager (Infra)" },
  { value: "pmc", label: "PMC" },
  { value: "pmo", label: "PMO" },
  { value: "warehouse_admin", label: "Warehouse Admin" },
] as const;

export type MemberRole = (typeof MEMBER_ROLES)[number]["value"];

// Dashboard Admin is a global flag (profiles.is_dashboard_admin), not a
// warehouse_members.role value — this sentinel exists only so the invite
// form can offer it in the same picker as the 6 operational roles. Never
// write it to a default_role/role column; createInvitation branches on it
// instead (grant_dashboard_admin: true, default_role: null).
export const DASHBOARD_ADMIN_VALUE = "dashboard_admin";

export const INVITE_ROLE_OPTIONS = [
  ...MEMBER_ROLES,
  { value: DASHBOARD_ADMIN_VALUE, label: "Dashboard Admin" },
] as const;

export function roleLabel(role: string | null | undefined) {
  return INVITE_ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role ?? "—";
}

// Single source of truth for role color-coding: each of the 6 roles keeps
// the same distinct color everywhere it's shown (team block, warehouse
// pickers, user management, etc.) — a coherent mapping, not per-screen.
export const ROLE_COLOR_CLASS: Record<string, string> = {
  operations: "bg-frost text-teal-deep border-frost",
  hvac_engineer: "bg-sky text-teal-deep border-sky",
  program_manager_infra: "bg-mint text-mint-deep border-mint",
  pmc: "bg-amber text-amber-deep border-amber",
  pmo: "bg-blush text-red-deep border-blush",
  warehouse_admin: "bg-line-soft text-foreground border-line",
};

// PLAN.md §2.1: reporters raise snags, resolvers drive them to close.
// Typed as string[] (not MemberRole[]) since these are checked against
// loosely-typed values coming back from the database client. Must match
// private.is_reporter()/is_resolver() in Postgres exactly — those are the
// functions actually enforcing this everywhere it matters (RLS, RPCs);
// these arrays only drive which controls the UI shows.
export const REPORTER_ROLES: string[] = ["operations", "hvac_engineer", "warehouse_admin"];
export const RESOLVER_ROLES: string[] = ["program_manager_infra", "pmc", "pmo"];
```

#### `src/lib/snags.ts`

```ts
export const CATEGORY_LABELS: Record<string, string> = {
  hvac: "HVAC",
  ops: "Ops",
};

export const SUB_CATEGORY_LABELS: Record<string, string> = {
  odu: "ODU",
  idu: "IDU",
  puff_panel: "Puff panel",
  plc: "PLC",
  door: "Door",
  floor: "Floor",
  piping: "Piping",
  racks: "Racks",
  electrical: "Electrical",
  iot_sensors: "IoT sensors",
  others: "Others",
};

export const LOCATION_LABELS: Record<string, string> = {
  frozen_chamber: "Frozen chamber",
  ante_room: "Ante room",
  odu_area: "ODU area",
  ambient_area: "WH ambient area",
};

export const SCOPE_LABELS: Record<string, string> = {
  oem: "OEM",
  infra: "Infra",
  admin: "Admin",
};

export const SEVERITY_LABELS: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  wip: "WIP",
  ready_to_close: "Verify",
  closed: "Closed",
};

export const SEVERITY_CHIP: Record<string, string> = {
  high: "bg-blush text-red-deep",
  medium: "bg-amber text-amber-deep",
  low: "bg-frost text-teal-deep",
};

export const STATUS_CHIP: Record<string, string> = {
  open: "bg-blush text-red-deep",
  wip: "bg-sky text-teal-deep",
  ready_to_close: "bg-mint text-mint-deep",
  closed: "bg-line-soft text-muted-foreground",
};

// Matches the Phase 0 view's semantics exactly: coalesce(closed_at::date,
// current_date) - date_raised. A pure calendar-day difference, not
// real-time hours — a snag raised this morning reads 0d all day, not 1d.
export function ageingDays(dateRaised: string, closedAt: string | null): number {
  const start = new Date(dateRaised + "T00:00:00");
  const endDateStr = closedAt ? closedAt.slice(0, 10) : new Date().toLocaleDateString("en-CA");
  const end = new Date(endDateStr + "T00:00:00");
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

// No exact banding is specified in PLAN.md beyond "colour-banded" — using
// under a week / one-to-two weeks / beyond as a reasonable default scale.
export function ageingClass(days: number): string {
  if (days >= 14) return "text-red";
  if (days >= 7) return "text-amber-deep";
  return "text-muted-foreground";
}

export function isOverdue(etcDate: string | null, status: string): boolean {
  if (!etcDate || status === "closed") return false;
  return new Date(etcDate + "T00:00:00").getTime() < new Date().setHours(0, 0, 0, 0);
}
```

#### `src/lib/supabase/client.ts`

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
```

#### `src/lib/supabase/proxy.ts`

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value)
          );
        },
      },
    }
  );

  // Do not run code between createServerClient and getClaims() — it's what
  // actually validates the JWT signature; getSession() alone is not enough
  // to trust in server-side code.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  const isPublicPath =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/auth") ||
    request.nextUrl.pathname.startsWith("/forgot-password") ||
    request.nextUrl.pathname.startsWith("/set-password");

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

#### `src/lib/supabase/server.ts`

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component. Safe to ignore because the
            // proxy is what actually refreshes the session on every request.
          }
        },
      },
    }
  );
}
```

#### `src/lib/sync-queue.ts`

```ts
import { createClient } from "@/lib/supabase/client";
import { uploadAttachment } from "@/lib/media";
import { listQueuedSnags, removeQueuedSnag, type QueuedSnag } from "@/lib/offline-queue";

// Flushes the offline queue: raises each snag with its client-generated id
// (raise_snag accepts p_id for exactly this), then uploads its photo if any.
// Stops at the first item that fails so a warehouse-membership or network
// error doesn't silently drop the rest of the queue out of order.
export async function syncOfflineQueue(): Promise<{ synced: string[]; error: string | null }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { synced: [], error: null };

  const queue = await listQueuedSnags();
  const synced: string[] = [];

  for (const item of queue) {
    const result = await syncOne(supabase, item, user.id);
    if (result.error) {
      return { synced, error: `${item.description.slice(0, 40)}…: ${result.error}` };
    }
    await removeQueuedSnag(item.localId);
    synced.push(item.localId);
  }

  return { synced, error: null };
}

async function syncOne(
  supabase: ReturnType<typeof createClient>,
  item: QueuedSnag,
  uploaderId: string
): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .rpc("raise_snag", {
      p_warehouse_id: item.warehouseId,
      p_description: item.description,
      p_category: item.category,
      p_sub_category: item.subCategory,
      p_sub_category_other: item.subCategoryOther,
      p_location: item.location,
      p_scope: item.scope,
      p_severity: item.severity,
      p_id: item.localId,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  const snagId = (data as { id: string }).id;

  for (let i = 0; i < item.photos.length; i++) {
    const upload = await uploadAttachment(supabase, {
      warehouseId: item.warehouseId,
      snagId,
      mediaType: "image",
      file: item.photos[i].annotated,
      original: item.photos[i].original,
      thumbnail: item.photos[i].thumbnail,
      fileName: `snag-photo-${i + 1}.jpg`,
      uploaderId,
    });
    if (upload.error) return { error: upload.error };
  }

  return { error: null };
}
```

#### `src/lib/table-sticky.ts`

```ts
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
```

#### `src/lib/utils.ts`

```ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Shared hover-lift treatment for card-style tiles (dashboard summary
// cards, warehouse cards, readiness tiles) so the pop-out feel is
// consistent everywhere it's applied.
export const CARD_HOVER = "transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md"
```

#### `src/proxy.ts`

```ts
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

