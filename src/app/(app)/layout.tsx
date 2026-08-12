import { createClient } from "@/lib/supabase/server";
import { AppShell } from "./app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;

  const [{ data: profile }, { data: warehouses }] = await Promise.all([
    supabase.from("profiles").select("full_name, email, is_dashboard_admin").eq("id", uid).single(),
    supabase.from("warehouses").select("id, name").eq("is_active", true).order("name"),
  ]);

  return (
    <AppShell profile={profile} warehouses={warehouses ?? []}>
      {children}
    </AppShell>
  );
}
