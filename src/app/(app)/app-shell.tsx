"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PendingSyncBanner } from "@/components/pending-sync-banner";
import { signOut } from "./actions";

type Warehouse = { id: string; name: string };
type Profile = { full_name: string | null; email: string; is_dashboard_admin: boolean } | null;

function HamburgerIcon() {
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
      <line x1="0" y1="1" x2="18" y2="1" stroke="currentColor" strokeWidth="1.5" />
      <line x1="0" y1="7" x2="18" y2="7" stroke="currentColor" strokeWidth="1.5" />
      <line x1="0" y1="13" x2="18" y2="13" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function AppShell({
  profile,
  warehouses,
  children,
}: {
  profile: Profile;
  warehouses: Warehouse[];
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const pathname = usePathname();
  const isAdmin = !!profile?.is_dashboard_admin;

  return (
    <div className="flex h-full min-h-screen flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border bg-card px-4.5 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Toggle sidebar"
            className="flex h-8 w-8 items-center justify-center rounded-md text-foreground hover:bg-muted"
          >
            <HamburgerIcon />
          </button>
          <span className="text-[14px] font-medium tracking-[-0.015em] text-foreground">
            Frozen warehouse launch readiness
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11.5px] text-muted-foreground">
            {profile?.full_name ?? profile?.email}
            {isAdmin ? " · Dashboard Admin" : ""}
          </span>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </div>
      <PendingSyncBanner />
      <div className="flex flex-1 items-stretch">
        {sidebarOpen && (
          <nav className="flex w-46 shrink-0 flex-col border-r border-border bg-card py-3.5">
            <div className="px-4 pb-2 text-[10px] uppercase tracking-[0.09em] text-faint">Warehouses</div>
            {warehouses.length === 0 && (
              <div className="px-4 py-1 text-[12px] text-muted-foreground">None yet</div>
            )}
            {warehouses.map((w) => {
              const href = `/warehouses/${w.id}`;
              const active = pathname === href;
              return (
                <Link
                  key={w.id}
                  href={href}
                  className={cn(
                    "block px-4 py-1.5 text-[12px] text-foreground",
                    active && "border-l-2 border-primary bg-accent pl-[14px] text-accent-foreground"
                  )}
                >
                  {w.name}
                </Link>
              );
            })}
            {isAdmin && (
              <>
                <div className="mx-4 my-2.5 h-px bg-border" />
                <Link
                  href="/warehouses/new"
                  className="block px-4 py-1.5 text-[12px] text-muted-foreground hover:text-foreground"
                >
                  + Add warehouse
                </Link>
                <Link
                  href="/admin/users"
                  className={cn(
                    "block px-4 py-1.5 text-[12px] text-muted-foreground hover:text-foreground",
                    pathname === "/admin/users" &&
                      "border-l-2 border-primary bg-accent pl-[14px] text-accent-foreground"
                  )}
                >
                  User management
                </Link>
              </>
            )}
          </nav>
        )}
        <main className="min-w-0 flex-1 bg-background">{children}</main>
      </div>
    </div>
  );
}
