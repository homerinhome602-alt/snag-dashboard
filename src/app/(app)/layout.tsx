import { createClient } from "@/lib/data/server";
import { AppShell } from "./app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;

  const [{ data: profile }, { data: warehouses }] = await Promise.all([
    // is_active is selected alongside is_dashboard_admin (not just for
    // display) — profiles is readable by anyone (profiles_select_all has no
    // is_active gate, unlike every real RLS policy), so a raw
    // is_dashboard_admin read alone would say "yes" for a deactivated admin
    // even though private.is_dashboard_admin() — what RLS actually checks —
    // says no. AppShell ANDs the two so the nav matches what the DB enforces.
    supabase.from("profiles").select("full_name, email, is_dashboard_admin, is_active").eq("id", uid).single(),
    supabase.from("warehouses").select("id, name").eq("is_active", true).order("name"),
  ]);

  return (
    <AppShell profile={profile} warehouses={warehouses ?? []}>
      {children}
    </AppShell>
  );
}
