@AGENTS.md

# Frozen Warehouse Launch Readiness

Snag-tracking for cold-storage warehouse launches. Reporters (HVAC / Operations / Warehouse Admin) raise defects; resolvers (Program Manager (Infra) / PMC / PMO) drive them closed before go-live.

Next.js 16 App Router · TypeScript · Tailwind · shadcn/ui (`@base-ui/react`) · self-hosted PostgreSQL 17 via `pg` · `exceljs`.

**Migrated off Supabase (3 Sep 2026.)** Auth, PostgREST, and Storage are gone; the database is a local Postgres. See "Architecture" below — it is the thing most likely to trip you up if you learned this codebase from an older version of these docs.

## Where truth lives

- **`PLAN.md`** — behaviour, schema, permissions, roles, screens. §0 has environment setup (now partly superseded by "Architecture" here). §5.9 is the exact copy reference (every validation message, empty state, placeholder, screen subtitle). **§15 is a literal SQL snapshot of the database** — still accurate: it is the same schema, now living in `db/10_schema.sql`. **§16 is the application source tree verbatim — stale as of the Supabase migration** (the `src/lib/data`, `src/lib/db`, `src/lib/pgrest`, `src/lib/auth`, `src/lib/storage`, `src/app/api` trees are new; read the files). Prose sections above §15 are current.
- **`DESIGN.md`** — palette, type, layout rules, component map, exact screen-by-screen layout reference, icon inventory, hover-vs-click classification. Check it for exact container widths and interaction behavior before guessing.
- **`db/`** — SQL that rebuilds the schema from nothing (`00`–`20`), `db/seed/` (committed sample data: 3 users, 4 warehouses, 10 snags, 15 image files), and `db/build.sh` (`--with-data` loads the seed). `db/README.md` explains them and how to refresh the seed. The seed holds real emails + bcrypt hashes — keep the repo private.

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

**Writes to `snags` and `snag_updates` go through RPC functions. Always.**
Those tables have no `UPDATE` or `DELETE` policy, so a direct write fails rather than doing nothing visible. Reporters and resolvers own different columns of the same row, and the RPCs are what keep them apart. Use `raise_snag`, `post_snag_update`, `verify_snag_closure`, `close_snag_directly`, `correct_date_raised`.

**Changing an RPC's parameter *count* needs an explicit `DROP FUNCTION IF EXISTS name(old_signature)` in the same migration.** `CREATE OR REPLACE FUNCTION` identifies a function by (name, parameter *types*), so adding a trailing param — even with a `DEFAULT` — leaves the old signature live and callable alongside the new one. (Under Supabase this also silently re-granted `anon`; that hazard is gone now that `db/10_schema.sql` grants explicitly and there is no `ALTER DEFAULT PRIVILEGES … TO anon`, but the double-overload bug itself still applies.)

**The update thread is a merged chat feed, not a one-way log.** `post_snag_update` takes `p_acting_as` (`'reporter' | 'resolver'`) and the server verifies the caller actually holds that role (or is Dashboard Admin). `snag_updates.author_side` (`'reporter' | 'resolver' | 'admin'`) is snapshotted **at post time** — never derive a message's side from the author's current `warehouse_members` role. `close_snag_directly` / `verify_snag_closure` return the composite `snag_action_result` (`{ snag, update_id }`); `update_id` is null unless a comment was posted, and the client uploads any attached media to that id. See `components/snag-compose.tsx` (4 compose modes) and `PLAN.md` §5.7.1.

**Admin tables use plain table writes under admin-only RLS — deliberately, don't "fix" them into RPCs.** `warehouses`, `warehouse_members`, `invitations` — see `warehouses/manage/actions.ts` and `admin/users/actions.ts`.

**`warehouse_members` is the authority on permissions and on read access.** Roles are per warehouse. `profiles.default_role` is only a sort hint; it grants nothing. Every permission check names a warehouse. Read access (SELECT on `warehouses`, `snags`, `snag_updates`, `attachments`, `snag_activity`, `snag_daily_snapshot`, `warehouse_members`) is scoped via `private.is_warehouse_member(warehouse_id)`. Dashboard Admin bypasses this — and every snag-action role check too.

**Views over RLS-protected tables need `security_invoker = true`, explicitly.** A plain view runs with its owner's row-security context. `warehouse_readiness` and `snags_with_derived` both set it. Check it on any new view — it fails silently (returns too many rows), never loudly.

**Dashboard Admin: three admin powers (user management, create/deactivate warehouses, correct `date_raised`) plus a full bypass on every snag-adjacent write** — `raise_snag`, `post_snag_update`, `verify_snag_closure`, `close_snag_directly`, `set_go_live_date`, the `attachments` insert policy, and the `storage.objects` insert policy all accept `private.is_dashboard_admin()` as an alternative to a warehouse role. A new snag-adjacent write path needs the same `OR private.is_dashboard_admin()`. The three UI pages that gate their own buttons (`warehouses/[id]/page.tsx`, `snags/new/page.tsx`, `import/page.tsx`) OR in the same check. `snag_activity` still records the admin's real `actor_id`.

**Two routes reach `closed`.** `verify_snag_closure` requires `ready_to_close`; `close_snag_directly` works from any status. Both reporter-only (or Dashboard Admin).

**Dashboard Admin is a role-picker sentinel, not a `member_role` enum value.** The invite form offers it via `lib/roles.ts`'s `INVITE_ROLE_OPTIONS` / `DASHBOARD_ADMIN_VALUE`. Picking it sets `grant_dashboard_admin = true`, `default_role = null`, no warehouse tagging. Don't add `"dashboard_admin"` to the `member_role` Postgres enum.

**Never hardcode a hex.** `globals.css` maps shadcn token names onto the design tokens. Role colours live in `lib/roles.ts`. One known unfixed exception: `warehouse-card.tsx`'s red-state border (`#EFC6BC`).

**Three things exist in the DB/repo but nothing calls them:** `create_warehouse(name, site_location, members jsonb)` RPC, `components/role-people-picker.tsx`, and the `warehouses_delete_admin` RLS policy. If asked to rebuild warehouse onboarding or add a delete button, these are what you'd wire back in.

**`lib/table-sticky.ts` uses pixel widths on purpose** — read the comment before touching it.

**A shim embed needs an FK-map entry.** `src/lib/pgrest/builder.ts`'s `EMBED_FK` maps `${baseTable}.${alias}` → the FK column for every `alias:profiles(...)` / `alias:warehouses(...)` embed the app uses. Adding a new `.select("…, x:profiles(…)")` anywhere means adding a line there, and the FK must point at `profiles(id)` (all `actor_id` / `author_id` / `raised_by` already do — this was true under PostgREST too, for the same embed reason).

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
- **`/about` deliberately never mentions Dashboard Admin** — explicit instruction. Reporters and Resolvers only.
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
