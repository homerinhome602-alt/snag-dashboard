@AGENTS.md

# Frozen Warehouse Launch Readiness

Snag-tracking for cold-storage warehouse launches. People are tagged to a warehouse with one of 6 roles (HVAC Engineer / Operations / Warehouse Admin / Program Manager (Infra) / PMC / PMO) — **but roles no longer gate snag work: anyone tagged can raise, comment, set ETC, move status, close, verify, reopen, and set the go-live date** (see the role-flatten rule below). Roles are labels: they set a person's default side in the chat feed and their badge colour.

Next.js 16 App Router · TypeScript · Tailwind · shadcn/ui (`@base-ui/react`) · self-hosted PostgreSQL 17 via `pg` · `exceljs`.

**Two big shifts, both post-dating most of `PLAN.md`/`DESIGN.md`:**
1. **Off Supabase (3 Sep 2026)** — Auth, PostgREST, Storage gone; local Postgres. See "Architecture" below.
2. **Roles flattened + new shared data (Sep 2026)** — the Reporter/Resolver permission split is gone; the warehouse page gained **Handover documents** and **Machine and Controller Details**; the app shell is now mobile-responsive. Covered in the rules and gotchas below.

## Where truth lives

- **`PLAN.md`** — behaviour, schema, permissions, roles, screens. §0 has environment setup (now partly superseded by "Architecture" here). §5.9 is the exact copy reference (every validation message, empty state, placeholder, screen subtitle). **§15 is a literal SQL snapshot of the database** — still accurate: it is the same schema, now living in `db/10_schema.sql`. **§16 is the application source tree verbatim — stale as of the Supabase migration** (the `src/lib/data`, `src/lib/db`, `src/lib/pgrest`, `src/lib/auth`, `src/lib/storage`, `src/app/api` trees are new; read the files). Prose sections above §15 are current.
- **`DESIGN.md`** — palette, type, layout rules, component map, exact screen-by-screen layout reference, icon inventory, hover-vs-click classification. Check it for exact container widths and interaction behavior before guessing.
- **`db/`** — SQL that rebuilds the schema from nothing, applied in this order by `db/build.sh`: `00_bootstrap`, `01_auth_storage_shim`, `10_schema` (the Supabase pull), `11_handover_and_chambers` (handover-docs + chamber tables), `12_flatten_snag_roles` (redefines `is_reporter`/`is_resolver`), `13_reopen_snag`, `14_post_snag_update_open`, then `20_post` after data. `db/seed/` holds committed sample data (3 users, 4 warehouses, 10 snags, 15 image files); `db/build.sh --with-data` loads it. `db/README.md` explains it and how to refresh the seed. The seed holds real emails + bcrypt hashes — keep the repo private.

Read the relevant section before changing behaviour or visuals. Don't restate their contents here or in code comments.

## Architecture (post-Supabase)

Supabase gave the app four things. Each was replaced:

| Was | Now |
|---|---|
| PostgREST (`supabase.from(...)`, `.rpc(...)`) | `src/lib/pgrest/builder.ts` — a hand-written builder that emulates the exact slice of the supabase-js surface this app uses (`select`/`eq`/`in`/`ilike`/`order`/`single`/`maybeSingle`/`insert`/`upsert`/`update`/`delete`/`rpc`), including `alias:table(cols)` embeds via a fixed FK map. It generates SQL and runs it through `pg`. |
| GoTrue (`supabase.auth.*`) | `src/lib/auth/` — `session.ts` (JWT cookie, jose HS256), `password.ts` (bcrypt, verifies the migrated `$2a$` hashes), `service.ts` (GoTrue-shaped `signInWithPassword` / `signUp` / `signOut` / `getClaims` / `getUser` / `resetPasswordForEmail` / `verifyOtp` / `updateUser`), `jwt.ts` (Edge-safe verify, imported by the proxy), `email.ts` (console mailer for local dev). |
| Supabase Storage (private `attachments` bucket) | `src/lib/storage/local.ts` (files under `STORAGE_DIR`, HMAC-signed URLs) + `src/app/api/attachments/route.ts` (upload) + `src/app/api/attachments/[...path]/route.ts` (serve). |
| The hosted Postgres, `anon`/`authenticated` roles, `auth.uid()` | A local Postgres 17. `src/lib/db/pool.ts` (one `pg.Pool`, with type parsers so `date`/`timestamp`/`int8` come back looking like PostgREST's JSON) and `src/lib/db/scope.ts`. |

**`src/lib/data/{client,server,proxy}.ts`** keep the old module paths and the `createClient()` / `updateSession()` signatures, so **every page and server action still calls `const supabase = await createClient()` and uses it unchanged** — no page or `actions.ts` file was touched in the migration. The directory is named `data`, not `supabase`, but the local variable is still conventionally `supabase`.

**How RLS still works.** The app connects as the unprivileged `authenticator` role. Every query goes through `withUser(uid, fn)` / `withAnon(fn)` / `withServiceRole(fn)` in `src/lib/db/scope.ts`, which opens a transaction, runs `SET LOCAL ROLE authenticated` (or `anon` / `service_role`), and publishes `request.jwt.claims` via `set_config(...)`. `auth.uid()` reads that GUC. So the schema's ~21 RLS policies and every `SECURITY DEFINER` RPC enforce exactly what they did under Supabase — **do not re-implement visibility checks in the app.** `service_role` has `BYPASSRLS` and is used only by trusted server paths (the invitation lookup in `signUp`, the storage-object metadata insert).

**Client components** (`snag-compose.tsx`, `add-snag-form.tsx`, `sync-queue.ts`) have no DB access. `src/lib/data/client.ts` routes their few needs through API routes: `auth.getUser` → `/api/me`, `.rpc("raise_snag")` → `/api/rpc` (allowlist of one), uploads → `/api/attachments` (via `uploadAttachment` in `src/lib/media.ts`).

**Env** (`.env.local`, gitignored): `DATABASE_URL` (local `authenticator@localhost:5433/snagdash`), `AUTH_SECRET` (signs the session cookie *and* the attachment signed-URLs — rotating it logs everyone out), `STORAGE_DIR`, `AUTH_AUTOCONFIRM` (`true` locally — new sign-ups skip email confirmation), `MAIL_PROVIDER` (`console` locally). `SUPABASE_*` vars, if present, are migration-tooling only and unread by the app. `.mcp.json` is empty.

## Rules that are not obvious from the code

**Roles are flattened — `private.is_reporter()` and `private.is_resolver()` both just `select private.is_warehouse_member(p_warehouse_id)`** (`db/12_flatten_snag_roles.sql`). So every RPC and RLS policy that checks either — `raise_snag`, `close_snag_directly`, `verify_snag_closure`, `reopen_snag`, `set_go_live_date`, `post_snag_update`, the `attachments` / `storage.objects` insert policies — now accepts any tagged warehouse member (or Dashboard Admin). `post_snag_update` (`db/14`) also no longer blocks ETC/status by `p_acting_as`. The 6 `member_role` values still exist and still matter for two things only: a person's **default side in the chat feed** (`REPORTER_ROLES` → left, `RESOLVER_ROLES` → right, in `lib/roles.ts`) and their **badge colour** (`ROLE_COLOR_CLASS`). If you re-introduce a real role gate, it goes in `is_reporter`/`is_resolver` — everything keys off those.

**Writes to `snags` and `snag_updates` go through RPC functions. Always.**
Those tables have no `UPDATE` or `DELETE` policy, so a direct write fails rather than doing nothing visible. The RPCs are `SECURITY DEFINER` and still own the column-level rules (e.g. `post_snag_update` only lets a plain update move status to `wip`/`ready_to_close`; closing goes through `close_snag_directly`/`verify_snag_closure`; reopening through `reopen_snag`). Use `raise_snag`, `post_snag_update`, `verify_snag_closure`, `close_snag_directly`, `reopen_snag`, `correct_date_raised`.

**Changing an RPC's parameter *count* needs an explicit `DROP FUNCTION IF EXISTS name(old_signature)` in the same migration.** `CREATE OR REPLACE FUNCTION` identifies a function by (name, parameter *types*), so adding a trailing param — even with a `DEFAULT` — leaves the old signature live and callable alongside the new one. (Under Supabase this also silently re-granted `anon`; that hazard is gone now that `db/10_schema.sql` grants explicitly and there is no `ALTER DEFAULT PRIVILEGES … TO anon`, but the double-overload bug itself still applies.)

**The update thread is a merged chat feed, not a one-way log.** `snag_updates.author_side` (`'reporter' | 'resolver' | 'admin'`) is snapshotted **at post time** — never derive a message's side from the author's current `warehouse_members` role. `post_snag_update` still takes `p_acting_as` (`'reporter' | 'resolver'`) and it still sets `author_side`, but **there is no acting-as toggle any more** — `snag-compose.tsx` derives it from the person's own role tag (resolver-type → `'resolver'`, everyone else → `'reporter'`; a pure Dashboard Admin's `author_side` is forced to `'admin'` server-side). One compose box for any member, all controls always shown; a **closed** snag renders a reopen-only form instead. `close_snag_directly` / `verify_snag_closure` / `reopen_snag` return the composite `snag_action_result` (`{ snag, update_id }`); `update_id` is null unless a comment was posted, and the client uploads any attached media to that id. See `PLAN.md` §5.7.1.

**Admin tables use plain table writes under admin-only RLS — deliberately, don't "fix" them into RPCs.** `warehouses`, `warehouse_members`, `invitations` — see `warehouses/manage/actions.ts` and `admin/users/actions.ts`.

**`warehouse_members` is the authority on permissions and on read access.** Roles are per warehouse. `profiles.default_role` is only a sort hint; it grants nothing. Every permission check names a warehouse. Read access (SELECT on `warehouses`, `snags`, `snag_updates`, `attachments`, `snag_activity`, `snag_daily_snapshot`, `warehouse_members`) is scoped via `private.is_warehouse_member(warehouse_id)`. Dashboard Admin bypasses this — and every snag-action role check too.

**Views over RLS-protected tables need `security_invoker = true`, explicitly.** A plain view runs with its owner's row-security context. `warehouse_readiness` and `snags_with_derived` both set it. Check it on any new view — it fails silently (returns too many rows), never loudly.

**Dashboard Admin: three admin powers (user management, create/deactivate warehouses, correct `date_raised`) plus a full bypass on every snag-adjacent write** — `raise_snag`, `post_snag_update`, `verify_snag_closure`, `close_snag_directly`, `reopen_snag`, `set_go_live_date`, the `attachments` insert policy, and the `storage.objects` insert policy all accept `private.is_dashboard_admin()` as an alternative to a warehouse role. (Since the role flatten, "a warehouse role" and "any membership" are the same thing, but the `OR is_dashboard_admin()` is still what lets an *untagged* admin act.) A new snag-adjacent write path needs the same `OR private.is_dashboard_admin()`. The UI pages that gate their own buttons (`warehouses/[id]/page.tsx`, `snags/new/page.tsx`, `import/page.tsx`) now gate on membership-or-admin. `snag_activity` still records the admin's real `actor_id`.

**Three routes leave a snag's terminal states.** `verify_snag_closure` (from `ready_to_close` → `closed` or → `wip`); `close_snag_directly` (any status → `closed`); `reopen_snag` (`closed` → `wip`, clearing `closed_at`/`verified_by`/`verified_at`). All three: any tagged member or Dashboard Admin.

**Handover documents & Machine and Controller details** (`db/11_handover_and_chambers.sql`, wired into `warehouses/[id]/page.tsx` between the snag table and the Team block). Four tables: `handover_document_types` (15 fixed-UUID reference rows, inline in the SQL), `warehouse_handover_documents` (per-warehouse file + auto-set `checked`; `checked_requires_file` CHECK constraint), `warehouse_chambers`, `warehouse_asset_activity` (shared append-only audit — upload/replace/remove/add/edit/delete). Write access is **any tagged member or admin** (`*_write_member` RLS policies use `is_warehouse_member`), not reporter-only. Server actions in `warehouses/[id]/asset-actions.ts` (they also re-check membership up front, since an RLS-blocked UPDATE is a silent 0-row no-op). Doc files reuse the `attachments` bucket under a `{warehouse_id}/handover/` prefix and the existing `/api/attachments/[...path]` serve route. Components: `handover-documents.tsx` (collapsible, per-row History modal), `chamber-details.tsx` (inline add/edit rows, per-cell labels on mobile).

**The app shell is mobile-responsive (`app-shell.tsx`).** Hover-expand rail at `md`+; below `md` an off-canvas drawer opened by a top-bar hamburger, closed by link tap / backdrop / × / Esc. Nav links live in a shared `NavLinks` sub-component. The snag table hides 9 secondary columns below `md` (`hidden md:table-cell` via `mobileHideClass` in `snag-table.tsx`) — phones see S.No / Description / Severity / Status, tap to expand. The filter bar collapses behind a "Filters" button below `sm` (`snag-filters.tsx`). `Button size="sm"` is `h-9` below `sm`, `h-7` at `sm`+. `layout.tsx` has an explicit `viewport` export. `admin/users` hides its Warehouse column below `sm`.

**Dashboard Admin is a role-picker sentinel, not a `member_role` enum value.** The invite form offers it via `lib/roles.ts`'s `INVITE_ROLE_OPTIONS` / `DASHBOARD_ADMIN_VALUE`. Picking it sets `grant_dashboard_admin = true`, `default_role = null`, no warehouse tagging. Don't add `"dashboard_admin"` to the `member_role` Postgres enum.

**Never hardcode a hex.** `globals.css` maps shadcn token names onto the design tokens. Role colours live in `lib/roles.ts`. One known unfixed exception: `warehouse-card.tsx`'s red-state border (`#EFC6BC`).

**Three things exist in the DB/repo but nothing calls them:** `create_warehouse(name, site_location, members jsonb)` RPC, `components/role-people-picker.tsx`, and the `warehouses_delete_admin` RLS policy. If asked to rebuild warehouse onboarding or add a delete button, these are what you'd wire back in.

**`lib/table-sticky.ts` uses pixel widths on purpose** — read the comment before touching it.

**A shim embed needs an FK-map entry.** `src/lib/pgrest/builder.ts`'s `EMBED_FK` maps `${baseTable}.${alias}` → the FK column for every `alias:profiles(...)` / `alias:warehouses(...)` embed the app uses (now includes `warehouse_asset_activity.actor`). Adding a new `.select("…, x:profiles(…)")` anywhere means adding a line there, and the FK must point at `profiles(id)` (all `actor_id` / `author_id` / `raised_by` already do — this was true under PostgREST too, for the same embed reason).

## Commands

```bash
npm run dev      # dev server (needs the local DB up — see below)
npm run build    # production build
npm run start    # serve the production build
npm run lint     # eslint

brew services start postgresql@17   # the database, on :5433
db/build.sh                         # rebuild the snagdash schema from db/*.sql (empty)
db/build.sh --with-data             # + load the committed sample data from db/seed/
```

## Gotchas

- **Schema changes live in `db/*.sql` now** (not a Supabase project). Change `db/10_schema.sql` (or add a numbered file) and re-run `db/build.sh`. There is no migration-history table; the files are the source of truth. `db/README.md` lists what's deliberately not reproduced from Supabase.
- **Deleting a warehouse cascades destructively**, taking snags, updates, attachments, burn-up history, audit trail. No soft delete. The Management UI has deactivate only, but `warehouses_delete_admin` + the cascade are still live and reachable via SQL.
- **`.env.local` holds `DATABASE_URL`, `AUTH_SECRET`, `STORAGE_DIR`, `AUTH_AUTOCONFIRM`, `MAIL_PROVIDER`.** `AUTH_SECRET` signs both the session cookie and attachment signed-URLs. `.mcp.json` is empty (`{"mcpServers":{}}`).
- The `AGENTS.md` block is rewritten by `next dev`. Commit it with your work.
- Category and scope are nullable for mobile-raised snags — the mobile flow defers them by design.
- **Re-inviting an already-signed-in user has no effect on their access** — `handle_new_user()` only runs on first sign-in. `createInvitation` refuses with an explicit error; `addWarehouseMembership` is the direct-table workaround (People screen → "+ Add warehouse", no role picker).
- **One role per *user*, not per warehouse** (product decision). `addWarehouseMembership` reads `profiles.default_role` and rewrites *all* of that user's `warehouse_members` rows under it — self-healing. A true per-warehouse dual role needs its own design.
- **"Deactivate" on a person does not revoke access.** `set_user_active()` writes `profiles.is_active`; nothing reads it (this predates the migration and is unchanged — `private.is_active_user()` was never added). See `PLAN.md` §14.3.
- **`/about` deliberately never mentions Dashboard Admin** — explicit instruction. The page was rewritten for the role-flatten (Sep 2026): it now leads with "anyone tagged to a warehouse can do every task on a snag", has one "On a snag, anyone tagged can" card, the shared "Everyone tagged to a warehouse" card (handover docs + chambers), and a "roles people hold" card that frames the 6 roles as chat-side + badge-colour labels only. Still no admin mention.
- **Burn-up chart: if cumulative totals drop day over day, truncate to start from the drop — don't clamp to the prior day's value.** See `PLAN.md` §12.1.
- **An `actor_id`/audit column must `references public.profiles(id)`** — the shim's embed resolution (like PostgREST's before it) needs the FK edge to `profiles`, not `auth.users`.
- **Session-less pages that read a recovery link** log the user straight in (`verifyOtp` creates a full session, matching GoTrue) — `/auth/update-password` then works off the normal session, not a special recovery cookie.
- **CSS-only hover tooltips need `padding`, not `margin`, between trigger and box, and no `pointer-events-none` on the box.** See `DESIGN.md`.
- **Instrument Sans renders as fake bold** — `globals.css` sets `font-weight:700` but `layout.tsx` only loads weight `500`. Don't "fix" without asking; it's a visual decision. See `DESIGN.md` Type section.
- **Don't infer a screen's layout from a similar-looking sibling — read the file.** Add Snag uses the standard full-width container; only Import uses the narrow one. See `DESIGN.md`.
- **`pg` type parsers** (`src/lib/db/pool.ts`): `date` → `"YYYY-MM-DD"` string, `timestamp(tz)` → ISO string, `int8` → number. Without these, `pg` returns `Date` objects and code like `snapshot_date.localeCompare(...)` and `go_live_date + "T00:00:00"` breaks. Add a parser there if you introduce a column type the app treats as a string.

## Scope

Match the request. Don't refactor adjacent code, rename things, add dependencies, or introduce abstractions that weren't asked for. Flag problems you notice rather than fixing them silently.

Ask before: deleting data, changing the schema (`db/*.sql`), changing RLS or the RPC surface, or altering the permission model.
