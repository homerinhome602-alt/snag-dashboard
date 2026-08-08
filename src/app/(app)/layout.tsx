import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "./sidebar";
import { signOut } from "./actions";
import { Button } from "@/components/ui/button";
import { PendingSyncBanner } from "@/components/pending-sync-banner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;

  const [{ data: profile }, { data: warehouses }] = await Promise.all([
    supabase.from("profiles").select("full_name, email, is_dashboard_admin").eq("id", uid).single(),
    supabase.from("warehouses").select("id, name").order("name"),
  ]);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border bg-card px-4.5 py-3">
        <span className="text-[14px] font-medium tracking-[-0.015em] text-foreground">
          Frozen warehouse launch readiness
        </span>
        <div className="flex items-center gap-3">
          <span className="text-[11.5px] text-muted-foreground">
            {profile?.full_name ?? profile?.email}
            {profile?.is_dashboard_admin ? " · Dashboard Admin" : ""}
          </span>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </div>
      <PendingSyncBanner />
      <div className="flex flex-1">
        <div className="hidden sm:block">
          <Sidebar warehouses={warehouses ?? []} isAdmin={!!profile?.is_dashboard_admin} />
        </div>
        <main className="flex-1 bg-background">{children}</main>
      </div>
    </div>
  );
}
