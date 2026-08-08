import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, is_dashboard_admin")
    .eq("id", claims?.sub)
    .single();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <div className="flex gap-[2px] w-40">
        {["#DCEAEE", "#E4EBEA", "#EDEAE5", "#F5E7E0", "#FBE4DE", "#F2C7BB", "#E89484", "#C75B4E"].map(
          (c) => (
            <span key={c} className="h-1.5 flex-1 first:rounded-l-full last:rounded-r-full" style={{ background: c }} />
          )
        )}
      </div>
      <h1 className="text-2xl text-foreground">Frozen Warehouse Launch Readiness</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Signed in as {profile?.full_name ?? profile?.email}
        {profile?.is_dashboard_admin ? " · Dashboard Admin" : ""}.
        Warehouse cards and the readiness gate land in Phase 2.
      </p>
      <form action={signOut}>
        <Button variant="outline" type="submit">
          Sign out
        </Button>
      </form>
    </div>
  );
}
