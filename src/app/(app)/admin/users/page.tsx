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
  email: string;
  defaultRole: string;
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

  const [{ data: invitations }, { data: profiles }] = await Promise.all([
    supabase.from("invitations").select("email, default_role, accepted_at").order("created_at"),
    supabase.from("profiles").select("id, email, is_active"),
  ]);

  const profileByEmail = new Map((profiles ?? []).map((p) => [p.email, p]));

  const rows: Row[] = (invitations ?? []).map((inv) => {
    const profile = profileByEmail.get(inv.email);
    return {
      email: inv.email,
      defaultRole: inv.default_role,
      userId: profile?.id ?? null,
      status: !profile ? "invited" : profile.is_active ? "active" : "deactivated",
    };
  });

  const activeCount = rows.filter((r) => r.status === "active").length;
  const invitedCount = rows.filter((r) => r.status === "invited").length;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
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

      <InviteForm />

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
                Status
              </TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No one invited yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.email}>
                <TableCell className="font-mono text-[11px]">{row.email}</TableCell>
                <TableCell className="text-[13px]">{roleLabel(row.defaultRole)}</TableCell>
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
