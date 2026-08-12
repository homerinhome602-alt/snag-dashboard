import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
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
import { StatusToggle } from "./status-toggle";

type Row = {
  key: string;
  name: string;
  role: string;
  isAdmin: boolean;
  warehouseNames: string[];
  status: "active" | "invited" | "deactivated";
  userId: string | null;
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

  const [{ data: invitations }, { data: profiles }, { data: warehouses }, { data: memberships }] =
    await Promise.all([
      supabase
        .from("invitations")
        .select("email, default_role, accepted_at, grant_dashboard_admin, warehouse_ids")
        .order("created_at"),
      supabase.from("profiles").select("id, email, full_name, is_active, is_dashboard_admin"),
      supabase.from("warehouses").select("id, name, is_active").order("name"),
      supabase.from("warehouse_members").select("user_id, warehouse:warehouses(name)"),
    ]);

  const activeWarehouses = (warehouses ?? []).filter((w) => w.is_active);
  const warehouseNameById = new Map((warehouses ?? []).map((w) => [w.id, w.name]));
  const profileByEmail = new Map((profiles ?? []).map((p) => [p.email, p]));

  const membershipsByUser = new Map<string, Set<string>>();
  for (const m of memberships ?? []) {
    const warehouseName = (m.warehouse as unknown as { name: string } | null)?.name;
    if (!warehouseName) continue;
    // A person can hold more than one role on the same warehouse (two
    // warehouse_members rows) — this column doesn't show roles, so the
    // warehouse name itself should only ever appear once per person.
    if (!membershipsByUser.has(m.user_id)) membershipsByUser.set(m.user_id, new Set());
    membershipsByUser.get(m.user_id)!.add(warehouseName);
  }

  const rows: Row[] = (invitations ?? []).map((inv) => {
    const profile = profileByEmail.get(inv.email);
    const invitedWarehouseNames = (inv.warehouse_ids ?? [])
      .map((id: string) => warehouseNameById.get(id))
      .filter((n: string | undefined): n is string => Boolean(n));
    return {
      key: inv.email,
      name: profile?.full_name ?? inv.email,
      role: inv.default_role,
      userId: profile?.id ?? null,
      status: !profile ? "invited" : profile.is_active ? "active" : "deactivated",
      isAdmin: profile ? profile.is_dashboard_admin : inv.grant_dashboard_admin,
      warehouseNames: profile
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

      <div className="overflow-hidden rounded-card border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-center">Admin</TableHead>
              <TableHead>Warehouse</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Change status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No one invited yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="text-[13px] text-foreground">{row.name}</TableCell>
                <TableCell className="text-[13px]">{roleLabel(row.role)}</TableCell>
                <TableCell className="text-center text-[11.5px] text-muted-foreground">
                  {row.isAdmin ? "Yes" : "No"}
                </TableCell>
                <TableCell className="whitespace-normal text-[12.5px] text-muted-foreground">
                  {row.warehouseNames.length === 0 ? (
                    "—"
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      {row.warehouseNames.map((n) => (
                        <span key={n}>{n}</span>
                      ))}
                    </div>
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
                    {row.status === "active"
                      ? "Active"
                      : row.status === "invited"
                        ? "Invited"
                        : "Deactivated"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {row.userId && <StatusToggle userId={row.userId} isActive={row.status === "active"} />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
