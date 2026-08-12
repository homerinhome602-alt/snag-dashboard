@AGENTS.md

# Frozen Warehouse Launch Readiness

Snag-tracking for cold-storage warehouse launches. Reporters (HVAC / Operations) raise defects; resolvers (Program Manager (Infra) / PMC / PMO / Warehouse Admin) drive them closed before go-live.

Next.js 16 App Router · TypeScript · Tailwind · shadcn/ui (`@base-ui/react`) · Supabase (Auth, Postgres, Storage) · `exceljs`.

## Where truth lives

- **`PLAN.md`** — behaviour, schema, permissions, roles, screens. Reconciled with the running code; §14 lists as-built divergences and known gaps.
- **`DESIGN.md`** — palette, type, layout rules, component map.

Read the relevant section before changing behaviour or visuals. Don't restate their contents here or in code comments.

## Rules that are not obvious from the code

**Writes to `snags` and `snag_updates` go through RPC functions. Always.**
Those tables have no `UPDATE` or `DELETE` policy, so a direct write fails rather than doing nothing visible. Reporters and resolvers own different columns of the same row, and the RPCs are what keep them apart. Use `raise_snag`, `post_snag_update`, `verify_snag_closure`, `close_snag_directly`, `correct_date_raised`.

**Admin tables are the opposite, deliberately.**
`warehouses`, `warehouse_members`, `invitations` use plain PostgREST calls guarded by admin-only RLS — see `warehouses/manage/actions.ts` (`createWarehouseCode`, `setWarehouseActive`) and `admin/users/actions.ts` (`createInvitation`, `setUserActive`). There's no cross-role column conflict to protect against, so a policy says it more simply than a function. Don't "fix" these into RPCs.

**`warehouse_members` is the authority on permissions — and now on read access too.**
Roles are per warehouse — the same person can be a reporter on one and a resolver on another. `profiles.default_role` is only a sort hint in the pickers; it grants nothing. Every permission check must name a warehouse. Read access (SELECT on `warehouses`, `snags`, `snag_updates`, `attachments`, `snag_activity`, `snag_daily_snapshot`, `warehouse_members` itself) is scoped the same way via `private.is_warehouse_member(warehouse_id)` — a non-admin, untagged user sees nothing for that warehouse. Dashboard Admin bypasses this one check — and, as of the snag-action bypass below, several others too.

**Views over RLS-protected tables need `security_invoker = true`, explicitly.** A plain Postgres view runs with its *owner's* row-security context, not the querying user's. `warehouse_readiness` is owned by `postgres`, which has `BYPASSRLS` — it was silently ignoring the scoping above regardless of who queried it, for as long as that setting was missing. This will not throw an error; it will just quietly return more rows than it should. Check it on any new view.

**Dashboard Admin: three administrative powers, plus a full bypass on snag actions (as of 12 Aug 2026).** The three original powers are unchanged and admin-only: user management, create/deactivate warehouses (no rename or delete in the UI — see Gotchas), correct `date_raised`. What changed: admin status now **also** bypasses the reporter/resolver check everywhere a snag gets touched — `raise_snag`, `post_snag_update`, `verify_snag_closure`, `close_snag_directly`, `set_go_live_date`, the `attachments` table insert policy, and the `storage.objects` insert policy for the `attachments` bucket all accept `private.is_dashboard_admin()` as an alternative to being tagged on that warehouse. This was a deliberate reversal of the original "admin has no operational rights" design (PLAN.md §2.2) — if you're adding a new snag-adjacent write path (another RPC, another direct table/storage insert), it needs the same `OR private.is_dashboard_admin()` or it will silently exclude admins while looking like it should work. The three UI pages that gate their own buttons on reporter/resolver status (`warehouses/[id]/page.tsx`, `snags/new/page.tsx`, `import/page.tsx`) OR in the same admin check — keep them in sync with the RPCs if you touch either.

**Two routes reach `closed`.** `verify_snag_closure` requires `ready_to_close`; `close_snag_directly` works from any status. Both are reporter-only (or Dashboard Admin, per the bypass above) — that restriction is the point, not the staging step.

**Dashboard Admin is a role-picker option, not a `member_role` enum value.** The invite form (`admin/users/invite-form.tsx`) offers "Dashboard Admin" in the same dropdown as the 6 operational roles via `lib/roles.ts`'s `INVITE_ROLE_OPTIONS` / `DASHBOARD_ADMIN_VALUE` — a client-side sentinel string, mutually exclusive with an operational role, never written to `warehouse_members.role` or `default_role`. Picking it sets `grant_dashboard_admin = true` and `default_role = null` instead (the column is nullable now for exactly this reason) and skips warehouse tagging, since admin's powers are global. Don't add `"dashboard_admin"` to the `member_role` Postgres enum — it would leak into `REPORTER_ROLES`/`RESOLVER_ROLES` classification and the team-block/role-picker UI, which all assume every `member_role` is a real per-warehouse operational role.

**Never hardcode a hex.** `globals.css` maps shadcn's token names onto the design tokens, so changing one token updates every component. Role colours live in `lib/roles.ts`.

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
- **There is currently no way to edit an existing member's role, warehouse tags, or admin status.** `handle_new_user()` only ever runs on someone's first sign-in — re-inviting an already-accepted email upserts the `invitations` row but has zero effect on their real access. `createInvitation` (`admin/users/actions.ts`) checks for this and refuses with an explicit error rather than silently no-opping. If you're asked to add editing for existing members, that's new functionality, not a bug fix.
- **Forgot-password needs a one-time Supabase dashboard edit no tool here can make.** The "Reset Password" email template still uses the default `{{ .ConfirmationURL }}`, which points at Supabase's own hosted verify page — that can't set a session cookie on this app's domain. It needs to become `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/update-password` in Authentication → Email Templates. Until that's done, the flow looks complete in code but the emailed link won't actually work.
- **Every table wrapper needs `bg-card` explicitly.** `TableBody`/`TableCell` don't set their own background, so without it a table's body silently inherits the page's `--ground` instead of white `--surface` — close enough in the palette (~5 luminance points) to go unnoticed in a screenshot. `TableHeader` already defaults to `bg-line`; the wrapping `<div className="rounded-card border ...">` around every `<Table>` is what needs the explicit `bg-card`.

## Scope

Match the request. Don't refactor adjacent code, rename things, add dependencies, or introduce abstractions that weren't asked for. Flag problems you notice rather than fixing them silently.

Ask before: deleting data, running migrations against the live database, changing RLS or the RPC surface, or altering the permission model.
