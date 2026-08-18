@AGENTS.md

# Frozen Warehouse Launch Readiness

Snag-tracking for cold-storage warehouse launches. Reporters (HVAC / Operations / Warehouse Admin) raise defects; resolvers (Program Manager (Infra) / PMC / PMO) drive them closed before go-live.

Next.js 16 App Router · TypeScript · Tailwind · shadcn/ui (`@base-ui/react`) · Supabase (Auth, Postgres, Storage) · `exceljs`.

## Where truth lives

- **`PLAN.md`** — behaviour, schema, permissions, roles, screens. Reconciled with the running code; §14 lists as-built divergences and known gaps. §0 has everything a from-scratch environment needs (dependency versions, env vars, storage bucket config, extensions).
- **`DESIGN.md`** — palette, type, layout rules, component map.

Read the relevant section before changing behaviour or visuals. Don't restate their contents here or in code comments.

## Rules that are not obvious from the code

**Writes to `snags` and `snag_updates` go through RPC functions. Always.**
Those tables have no `UPDATE` or `DELETE` policy, so a direct write fails rather than doing nothing visible. Reporters and resolvers own different columns of the same row, and the RPCs are what keep them apart. Use `raise_snag`, `post_snag_update`, `verify_snag_closure`, `close_snag_directly`, `correct_date_raised`.

**`CREATE OR REPLACE FUNCTION` does not replace a function whose argument count changed — it silently creates a new overload.** Discovered while widening `post_snag_update`/`close_snag_directly`/`verify_snag_closure` to accept a new trailing param: Postgres identifies a function by (name, parameter *types*), so adding one more parameter — even with a `DEFAULT` — leaves the old signature intact and callable alongside the new one, confirmed by `mcp__supabase__get_advisors` listing both. Worse, the new overload is a genuinely new database object, so it re-triggers Supabase's default anon+authenticated grant even though the old function had already had `anon` revoked to match this app's convention. If you're changing an RPC's parameter *count* (not just a body edit), explicitly `DROP FUNCTION IF EXISTS name(old_signature)` in the same migration, and re-check `REVOKE EXECUTE ... FROM anon` on the new one — `CREATE OR REPLACE` alone is not enough.

**The update thread is a merged chat feed, not a one-way log (as of 14 Aug 2026).** `post_snag_update` is no longer resolver-only — it takes `p_acting_as` (`'reporter' | 'resolver'`) and the server verifies the caller actually holds that role (or is Dashboard Admin) rather than trusting the client. `snag_updates.author_side` (`'reporter' | 'resolver' | 'admin'`) is snapshotted **at post time** — never derive a message's side from the author's current `warehouse_members` role, or old messages will retroactively flip sides if someone's tag later changes. `close_snag_directly`/`verify_snag_closure` both gained an optional `p_body` and now return the composite type `snag_action_result` (`{ snag, update_id }`) instead of a bare `snags` row — `update_id` is null unless a comment was actually posted, and the client uploads any attached photo/video to that id the same two-step way `raise_snag` already works. See `components/snag-compose.tsx` for the 4 compose-box modes (reporter-only / resolver-only / dual-role toggle / admin-everything-at-once) and `PLAN.md` §5.7.1 for the full design.

**Admin tables are the opposite, deliberately.**
`warehouses`, `warehouse_members`, `invitations` use plain PostgREST calls guarded by admin-only RLS — see `warehouses/manage/actions.ts` (`createWarehouseCode`, `setWarehouseActive`) and `admin/users/actions.ts` (`createInvitation`, `setUserActive`). There's no cross-role column conflict to protect against, so a policy says it more simply than a function. Don't "fix" these into RPCs.

**`warehouse_members` is the authority on permissions — and now on read access too.**
Roles are per warehouse — the same person can be a reporter on one and a resolver on another. `profiles.default_role` is only a sort hint in the pickers; it grants nothing. Every permission check must name a warehouse. Read access (SELECT on `warehouses`, `snags`, `snag_updates`, `attachments`, `snag_activity`, `snag_daily_snapshot`, `warehouse_members` itself) is scoped the same way via `private.is_warehouse_member(warehouse_id)` — a non-admin, untagged user sees nothing for that warehouse. Dashboard Admin bypasses this one check — and, as of the snag-action bypass below, several others too.

**Views over RLS-protected tables need `security_invoker = true`, explicitly.** A plain Postgres view runs with its *owner's* row-security context, not the querying user's. `warehouse_readiness` is owned by `postgres`, which has `BYPASSRLS` — it was silently ignoring the scoping above regardless of who queried it, for as long as that setting was missing. This will not throw an error; it will just quietly return more rows than it should. Check it on any new view.

**Dashboard Admin: three administrative powers, plus a full bypass on snag actions (as of 12 Aug 2026).** The three original powers are unchanged and admin-only: user management, create/deactivate warehouses (no rename or delete in the UI — see Gotchas), correct `date_raised`. What changed: admin status now **also** bypasses the reporter/resolver check everywhere a snag gets touched — `raise_snag`, `post_snag_update`, `verify_snag_closure`, `close_snag_directly`, `set_go_live_date`, the `attachments` table insert policy, and the `storage.objects` insert policy for the `attachments` bucket all accept `private.is_dashboard_admin()` as an alternative to being tagged on that warehouse. This was a deliberate reversal of the original "admin has no operational rights" design (PLAN.md §2.2) — if you're adding a new snag-adjacent write path (another RPC, another direct table/storage insert), it needs the same `OR private.is_dashboard_admin()` or it will silently exclude admins while looking like it should work. The three UI pages that gate their own buttons on reporter/resolver status (`warehouses/[id]/page.tsx`, `snags/new/page.tsx`, `import/page.tsx`) OR in the same admin check — keep them in sync with the RPCs if you touch either.

**Two routes reach `closed`.** `verify_snag_closure` requires `ready_to_close`; `close_snag_directly` works from any status. Both are reporter-only (or Dashboard Admin, per the bypass above) — that restriction is the point, not the staging step.

**Dashboard Admin is a role-picker option, not a `member_role` enum value.** The invite form (`admin/users/invite-form.tsx`) offers "Dashboard Admin" in the same dropdown as the 6 operational roles via `lib/roles.ts`'s `INVITE_ROLE_OPTIONS` / `DASHBOARD_ADMIN_VALUE` — a client-side sentinel string, mutually exclusive with an operational role, never written to `warehouse_members.role` or `default_role`. Picking it sets `grant_dashboard_admin = true` and `default_role = null` instead (the column is nullable now for exactly this reason) and skips warehouse tagging, since admin's powers are global. Don't add `"dashboard_admin"` to the `member_role` Postgres enum — it would leak into `REPORTER_ROLES`/`RESOLVER_ROLES` classification and the team-block/role-picker UI, which all assume every `member_role` is a real per-warehouse operational role.

**Never hardcode a hex.** `globals.css` maps shadcn's token names onto the design tokens, so changing one token updates every component. Role colours live in `lib/roles.ts`. One known exception is currently unfixed: `warehouse-card.tsx`'s red-state border (`#EFC6BC`) doesn't match any token — see `DESIGN.md`'s colour table for why it was left alone rather than silently swapped to the nearest one.

**Three things still exist in the database/repo but nothing calls them — don't assume they're wired up.** Found during the 18 Aug 2026 documentation audit, when `PLAN.md`'s description of warehouse onboarding turned out to describe a screen that no longer exists (superseded 11 Aug 2026 by the much simpler code-only create at `warehouses/manage/`, see `PLAN.md` §5.4–5.5):
- `create_warehouse(name, site_location, members jsonb)` RPC — still deployed, still fully functional, but no frontend code calls it (`createWarehouseCode` in `warehouses/manage/actions.ts` does a plain two-column insert instead).
- `components/role-people-picker.tsx` — the searchable multi-select role picker the old onboarding form used. Compiles fine, imported by nothing.
- `warehouses_delete_admin` RLS policy — still live (admin-only `DELETE` on `warehouses`), reachable via direct PostgREST/SQL even though no UI button issues one. See the existing "deleting a warehouse cascades destructively" gotcha below — this is how that would actually get triggered today.

If you're asked to rebuild warehouse onboarding or add a delete button, these three are exactly what you'd be wiring back in — check they still match reality before assuming so, since this list itself can go stale.

**`lib/table-sticky.ts` uses pixel widths on purpose.** Percentages compute correctly but the rendered box ignores them under `table-layout: auto`, which drifts the sticky offsets. Read the comment there before touching it.

## Commands

```bash
npm run dev      # dev server
npm run build    # production build
npm run lint     # eslint
```

Schema changes go through Supabase migrations, not hand-edited SQL against the live database.

## Gotchas

- **Migrations are not in version control.** They exist only in the Supabase project — check the current count with `mcp__supabase__list_migrations` rather than trusting a number here. Run `npx supabase db pull` into `supabase/migrations/` before any environment move.
- **Deleting a warehouse cascades destructively**, taking snags, updates, attachments, burn-up history and the audit trail. No soft delete exists. See `PLAN.md` §5.5. The Warehouse Management UI no longer has a delete button (deactivate only) — but the underlying `warehouses_delete_admin` RLS policy and cascade are both still live in the database, reachable directly (SQL, PostgREST). Removing the UI didn't remove the capability.
- `.env.local` is gitignored and holds the Supabase URL and publishable key. `.mcp.json` is committed and holds the project ref.
- The `AGENTS.md` block is rewritten by `next dev`. Commit it with your work rather than fighting it.
- Category and scope are nullable for mobile-raised snags — the mobile flow defers them by design.
- **Tagging an already-accepted member onto a new warehouse is possible (as of 17 Aug 2026); admin status still can't be changed.** `handle_new_user()` only ever runs on someone's first sign-in — re-inviting an already-accepted email upserts the `invitations` row but has zero effect on their real access, so `createInvitation` (`admin/users/actions.ts`) refuses with an explicit error rather than silently no-opping. `addWarehouseMembership` (same file) works around this the direct-table way, per the "admin tables" convention below, surfaced via each row's "+ Add warehouse" control (`add-warehouse-control.tsx`) on the People screen — which has no role picker at all. There's still no UI or action to change `profiles.is_dashboard_admin` for someone who's already signed in — that's new functionality if asked for.
- **One role per *user*, not per warehouse — explicit product decision (17 Aug 2026) that narrows §2.1's "reporter and resolver are properties of a user-warehouse pair."** `addWarehouseMembership` doesn't take a role at all; it reads `profiles.default_role` (set once at invite time) as that person's one and only role, and rewrites *all* of their `warehouse_members` rows — existing plus newly-picked warehouses — under it. This is deliberately self-healing: it was added after a real account ended up with two different roles across its tagged warehouses (one added at a time, each call trusting a caller-supplied role), and running it again on that account collapsed all four rows back to one role. If a warehouse-scoped dual-role (reporter on warehouse A, resolver on warehouse B) is ever wanted again, `default_role` can no longer be the source of truth for it — that needs its own design pass, not a revert of this action.
- **Forgot-password needs a one-time Supabase dashboard edit no tool here can make.** The "Reset Password" email template still uses the default `{{ .ConfirmationURL }}`, which points at Supabase's own hosted verify page — that can't set a session cookie on this app's domain. It needs to become `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/update-password` in Authentication → Email Templates. Until that's done, the flow looks complete in code but the emailed link won't actually work.
- **Every table wrapper needs `bg-card` explicitly.** `TableBody`/`TableCell` don't set their own background, so without it a table's body silently inherits the page's `--ground` instead of white `--surface` — close enough in the palette (~5 luminance points) to go unnoticed in a screenshot. `TableHeader` already defaults to `bg-line`; the wrapping `<div className="rounded-card border ...">` around every `<Table>` is what needs the explicit `bg-card`.
- **"Deactivate" on a person (User Management) does not currently revoke their access — found 18 Aug 2026, unpatched.** `set_user_active()` writes `profiles.is_active`; nothing reads it — not `is_dashboard_admin()`, not `is_warehouse_member()`, not `has_warehouse_role()` (what `is_reporter`/`is_resolver` both call), no RLS policy, no auth gate. A deactivated person keeps full access; only the status badge changes. See `PLAN.md` §14.3 for the drafted (but not applied) fix — don't assume deactivation works until that's actually run.
- **`/about` (`app/(app)/about/page.tsx`) deliberately never mentions Dashboard Admin** — an explicit instruction, not a gap to fill in. It covers only the two operational role categories, Reporters and Resolvers. Don't add an admin section to it without being asked.
- **If the burn-up chart's cumulative totals ever drop day over day, don't fix it by clamping to the prior day's value — truncate to start from the drop instead.** Tried the clamp first (18 Aug 2026): a warehouse whose test data got reset had a real current total sitting *below* its stale pre-reset peak, so the clamp pinned the chart at that fictional peak forever, since the true value could never climb back above it. See `PLAN.md` §12.1.

## Scope

Match the request. Don't refactor adjacent code, rename things, add dependencies, or introduce abstractions that weren't asked for. Flag problems you notice rather than fixing them silently.

Ask before: deleting data, running migrations against the live database, changing RLS or the RPC surface, or altering the permission model.
