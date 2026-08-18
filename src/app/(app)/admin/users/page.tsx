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
