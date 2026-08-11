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
import { AdminToggle } from "./admin-toggle";

type Row = {
  email: string;
  defaultRole: string;
  status: "active" | "invited" | "deactivated";
  userId: string | null;
  isAdmin: boolean;
  adminPending: boolean;
  warehouseDisplay: string;
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
        .select("email, default_role, accepted_at, grant_dashboard_admin, warehouse_id, warehouse:warehouses(name)")
        .order("created_at"),
      supabase.from("profiles").select("id, email, is_active, is_dashboard_admin"),
      supabase.from("warehouses").select("id, name").order("name"),
      supabase.from("warehouse_members").select("user_id, role, warehouse:warehouses(name)"),
    ]);

  const profileByEmail = new Map((profiles ?? []).map((p) => [p.email, p]));

  const membershipsByUser = new Map<string, string[]>();
  for (const m of memberships ?? []) {
    const warehouseName = (m.warehouse as unknown as { name: string } | null)?.name;
    if (!warehouseName) continue;
    const label = `${warehouseName} (${roleLabel(m.role)})`;
    membershipsByUser.set(m.user_id, [...(membershipsByUser.get(m.user_id) ?? []), label]);
  }

  const rows: Row[] = (invitations ?? []).map((inv) => {
    const profile = profileByEmail.get(inv.email);
    const invitedWarehouseName = (inv.warehouse as unknown as { name: string } | null)?.name;
    const currentMemberships = profile ? membershipsByUser.get(profile.id) : undefined;
    return {
      email: inv.email,
      defaultRole: inv.default_role,
      userId: profile?.id ?? null,
      status: !profile ? "invited" : profile.is_active ? "active" : "deactivated",
      isAdmin: profile?.is_dashboard_admin ?? false,
      adminPending: !profile && inv.grant_dashboard_admin,
      warehouseDisplay: profile
        ? currentMemberships?.join(", ") ?? "—"
        : invitedWarehouseName
          ? `${invitedWarehouseName} (pending)`
          : "—",
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

      <InviteForm warehouses={warehouses ?? []} />

      <div className="overflow-hidden rounded-card border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[9px] uppercase tracking-[0.07em] text-faint">
                Email
              </TableHead>
              <TableHead className="text-[9px] uppercase tracking-[0.07em] text-faint">
                Default role
              </TableHead>
              <TableHead className="text-[9px] uppercase tracking-[0.07em] text-faint">
                Warehouse
              </TableHead>
              <TableHead className="text-[9px] uppercase tracking-[0.07em] text-faint">
                Status
              </TableHead>
              <TableHead className="text-[9px] uppercase tracking-[0.07em] text-faint">
                Admin
              </TableHead>
              <TableHead />
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
              <TableRow key={row.email}>
                <TableCell className="font-mono text-[11px]">
                  <div className="flex items-center gap-2.5">
                    {row.email}
                    {row.userId && <AdminToggle userId={row.userId} isAdmin={row.isAdmin} />}
                  </div>
                </TableCell>
                <TableCell className="text-[13px]">{roleLabel(row.defaultRole)}</TableCell>
                <TableCell className="text-[12.5px] text-muted-foreground">{row.warehouseDisplay}</TableCell>
                <TableCell>
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
                <TableCell>
                  {row.userId ? (
                    <span className="text-[11.5px] text-muted-foreground">{row.isAdmin ? "Yes" : "No"}</span>
                  ) : row.adminPending ? (
                    <span className="text-[11.5px] text-amber-deep">Yes, on signup</span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right">
                  {row.userId && (
                    <div className="flex justify-end gap-3">
                      <StatusToggle userId={row.userId} isActive={row.status === "active"} />
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
