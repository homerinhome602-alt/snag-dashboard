import { redirect } from "next/navigation";
import { createClient } from "@/lib/data/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { roleLabel, isEffectiveAdmin } from "@/lib/roles";
import { InviteForm } from "./invite-form";
import { PersonRow, type PersonActivityRow } from "./person-row";

type Row = {
  key: string;
  name: string;
  role: string;
  warehouseNames: string[];
  status: "active" | "deactivated";
  userId: string | null;
  isDashboardAdmin: boolean;
};

export default async function UserManagementPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;

  const { data: me } = await supabase
    .from("profiles")
    .select("is_dashboard_admin, is_active")
    .eq("id", uid)
    .single();

  if (!isEffectiveAdmin(me)) {
    redirect("/");
  }

  const [{ data: invitations }, { data: profiles }, { data: warehouses }, { data: memberships }, { data: activity }] =
    await Promise.all([
      supabase
        .from("invitations")
        .select("email, default_role, accepted_at, grant_dashboard_admin, warehouse_ids, created_at")
        .order("created_at"),
      supabase.from("profiles").select("id, email, full_name, is_active, is_dashboard_admin, created_at"),
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

  // Rows come from the union of invitations and profiles, not invitations
  // alone — sign-in has no invitation gate any more, so someone can have a
  // real, active profile with no invitation at all (walked up with their
  // own email, saw no warehouses, but still exists and needs to be
  // manageable — visible, deactivatable — from this screen).
  const invitationByEmail = new Map((invitations ?? []).map((inv) => [inv.email, inv]));
  const allEmails = new Set<string>([
    ...(invitations ?? []).map((inv) => inv.email),
    ...(profiles ?? []).map((p) => p.email),
  ]);
  const sortKey = (email: string) =>
    invitationByEmail.get(email)?.created_at ?? profileByEmail.get(email)?.created_at ?? "";

  const rows: Row[] = [...allEmails]
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
    .map((email) => {
      const inv = invitationByEmail.get(email);
      const profile = profileByEmail.get(email);
      const invitedWarehouseNames = (inv?.warehouse_ids ?? [])
        .map((id: string) => warehouseNameById.get(id))
        .filter((n: string | undefined): n is string => Boolean(n));
      // Dashboard Admin is folded into this same column rather than shown
      // separately — once someone has signed in, default_role on the
      // invitation is no longer authoritative (PLAN.md §3.1), so a
      // provisioned profile shows its real is_dashboard_admin flag plus
      // real warehouse_members role(s); a bare invitation with no profile
      // yet (a stray row — provisioning normally happens immediately) falls
      // back to what was invited; a profile with no invitation at all (a
      // walk-up sign-in) has neither — no role, no admin, no warehouses.
      const isDashboardAdmin = profile ? profile.is_dashboard_admin : (inv?.grant_dashboard_admin ?? false);
      const roleText = profile
        ? [
            ...(isDashboardAdmin ? ["Dashboard Admin"] : []),
            ...[...(rolesByUser.get(profile.id) ?? [])].map(roleLabel),
          ].join(", ") || "—"
        : isDashboardAdmin
          ? "Dashboard Admin"
          : roleLabel(inv?.default_role);
      return {
        key: email,
        name: profile?.full_name ?? email,
        role: roleText,
        userId: profile?.id ?? null,
        isDashboardAdmin,
        // Only two statuses exist: active / deactivated — never a pending
        // "invited" state. !profile should be rare (a stray invitations row
        // whose provisioning failed); such an email still gets in on its
        // next sign-in, so it reads as "active", not a third state.
        status: !profile || profile.is_active ? "active" : "deactivated",
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
  const deactivatedCount = rows.filter((r) => r.status === "deactivated").length;

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 sm:py-8 lg:px-[50px]">
      <div className="mb-1 flex items-baseline justify-between">
        <h1 className="text-[17px] text-foreground">People</h1>
        <span className="text-[13px] text-muted-foreground">
          {activeCount} active · {deactivatedCount} deactivated
        </span>
      </div>
      <p className="mb-5 max-w-[60ch] text-[13px] leading-relaxed text-muted-foreground">
        Anyone can sign in with any email — there&apos;s no invite gate. Inviting someone here is
        what tags them to a warehouse (or grants Dashboard Admin) the moment they sign in with
        that exact address; without it, they land on an empty dashboard.
      </p>

      <InviteForm warehouses={activeWarehouses} />

      <p className="mb-1.5 text-[12.5px] text-muted-foreground">Click a row to see its change history.</p>

      <div className="overflow-hidden rounded-card border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="hidden sm:table-cell">Warehouse</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Change status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No one yet.
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
