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
`warehouses`, `warehouse_members`, `invitations` use plain PostgREST calls guarded by admin-only RLS — see `warehouses/manage/actions.ts`. There's no cross-role column conflict to protect against, so a policy says it more simply than a function. Don't "fix" these into RPCs.

**`warehouse_members` is the authority on permissions — and now on read access too.**
Roles are per warehouse — the same person can be a reporter on one and a resolver on another. `profiles.default_role` is only a sort hint in the pickers; it grants nothing. Every permission check must name a warehouse. Read access (SELECT on `warehouses`, `snags`, `snag_updates`, `attachments`, `snag_activity`, `snag_daily_snapshot`, `warehouse_members` itself) is scoped the same way via `private.is_warehouse_member(warehouse_id)` — a non-admin, untagged user sees nothing for that warehouse. Dashboard Admin bypasses this one check, and nothing else does (see the next rule).

**Views over RLS-protected tables need `security_invoker = true`, explicitly.** A plain Postgres view runs with its *owner's* row-security context, not the querying user's. `warehouse_readiness` is owned by `postgres`, which has `BYPASSRLS` — it was silently ignoring the scoping above regardless of who queried it, for as long as that setting was missing. This will not throw an error; it will just quietly return more rows than it should. Check it on any new view.

**Dashboard Admin has exactly three write powers, plus one read bypass**: user management, create/rename/delete warehouses, correct `date_raised` — and read access to every warehouse without being tagged to any of them. It grants **no** operational (write) rights beyond those three — an admin must tag themselves into a warehouse like anyone else to raise a snag or post an update. Only `correct_date_raised` and the read-scoping check accept admin status as sufficient.

**Two routes reach `closed`.** `verify_snag_closure` requires `ready_to_close`; `close_snag_directly` works from any status. Both are reporter-only — that restriction is the point, not the staging step.

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
- **Deleting a warehouse cascades destructively**, taking snags, updates, attachments, burn-up history and the audit trail. No soft delete exists. See `PLAN.md` §5.5.
- `.env.local` is gitignored and holds the Supabase URL and publishable key. `.mcp.json` is committed and holds the project ref.
- The `AGENTS.md` block is rewritten by `next dev`. Commit it with your work rather than fighting it.
- Category and scope are nullable for mobile-raised snags — the mobile flow defers them by design.

## Scope

Match the request. Don't refactor adjacent code, rename things, add dependencies, or introduce abstractions that weren't asked for. Flag problems you notice rather than fixing them silently.

Ask before: deleting data, running migrations against the live database, changing RLS or the RPC surface, or altering the permission model.
