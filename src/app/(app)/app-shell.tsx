"use client";

import { useEffect, useState } from "react";
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

function HomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M2 7.5 8 2l6 5.5M3.5 6.5V13a.5.5 0 0 0 .5.5h3v-4h2v4h3a.5.5 0 0 0 .5-.5V6.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 7.25v4M8 5.25v.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

const SIDEBAR_WIDTH = "11.5rem"; // w-46 equivalent
const SIDEBAR_COLLAPSED = "3rem";
const SIDEBAR_LINK_HOVER = "transition-all duration-150 ease-out hover:translate-x-0.5 hover:text-coral";

function NavLinks({
  pathname,
  warehouses,
  isAdmin,
  onNavigate,
}: {
  pathname: string;
  warehouses: Warehouse[];
  isAdmin: boolean;
  onNavigate?: () => void;
}) {
  return (
    <>
      <Link
        href="/"
        aria-label="Home"
        onClick={onNavigate}
        className={cn(SIDEBAR_LINK_HOVER, "flex h-9 items-center gap-2 px-4 text-foreground hover:bg-muted")}
      >
        <HomeIcon />
        <span className="text-[12px] whitespace-nowrap">Home</span>
      </Link>
      <Link
        href="/about"
        aria-label="About the page"
        onClick={onNavigate}
        className={cn(SIDEBAR_LINK_HOVER, "flex h-9 items-center gap-2 px-4 text-foreground hover:bg-muted")}
      >
        <InfoIcon />
        <span className="text-[12px] whitespace-nowrap">About the page</span>
      </Link>
      <div className="mx-4 my-2.5 h-px bg-border" />
      <div className="px-4 pb-2 text-[9px] uppercase tracking-[0.07em] text-faint">Warehouses</div>
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
            onClick={onNavigate}
            className={cn(
              SIDEBAR_LINK_HOVER,
              "block px-4 py-2 text-[12px] whitespace-nowrap text-foreground",
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
            href="/warehouses/manage"
            onClick={onNavigate}
            className={cn(
              SIDEBAR_LINK_HOVER,
              "block px-4 py-2 text-[12px] whitespace-nowrap text-muted-foreground",
              pathname === "/warehouses/manage" &&
                "border-l-2 border-primary bg-accent pl-[14px] text-accent-foreground"
            )}
          >
            Warehouse management
          </Link>
          <Link
            href="/admin/users"
            onClick={onNavigate}
            className={cn(
              SIDEBAR_LINK_HOVER,
              "block px-4 py-2 text-[12px] whitespace-nowrap text-muted-foreground",
              pathname === "/admin/users" &&
                "border-l-2 border-primary bg-accent pl-[14px] text-accent-foreground"
            )}
          >
            User management
          </Link>
        </>
      )}
    </>
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
  const [open, setOpen] = useState(false); // desktop hover-expand
  const [mobileOpen, setMobileOpen] = useState(false); // mobile drawer
  const pathname = usePathname();
  const isAdmin = !!profile?.is_dashboard_admin;

  // The drawer closes on link tap (onNavigate), the backdrop, the × button,
  // and Esc — that covers every path except a raw browser back/forward while
  // it's open, which is rare and harmless.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <div className="flex h-full min-h-screen flex-1">
      {/* Desktop rail — hover to expand */}
      <nav
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        style={{ width: open ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED }}
        className="sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-border bg-card py-3.5 transition-[width] duration-200 ease-in-out md:flex"
      >
        <div className="ml-2 mb-3 flex shrink-0 flex-col gap-1">
          <button
            type="button"
            aria-label="Toggle sidebar"
            onClick={() => setOpen((v) => !v)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-muted"
          >
            <HamburgerIcon />
          </button>
        </div>
        <div
          style={{ width: SIDEBAR_WIDTH }}
          className={cn(
            "flex flex-1 flex-col overflow-y-auto overflow-x-hidden transition-opacity ease-in-out",
            open ? "opacity-100 duration-150 delay-100" : "pointer-events-none opacity-0 duration-75"
          )}
        >
          <NavLinks pathname={pathname} warehouses={warehouses} isAdmin={isAdmin} />
        </div>
      </nav>

      {/* Mobile drawer + backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <nav
        aria-label="Main navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col overflow-y-auto border-r border-border bg-card py-3.5 transition-transform duration-200 ease-out md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="mb-2 flex items-center justify-between px-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-faint">Menu</span>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <span className="text-[18px] leading-none">×</span>
          </button>
        </div>
        <NavLinks
          pathname={pathname}
          warehouses={warehouses}
          isAdmin={isAdmin}
          onNavigate={() => setMobileOpen(false)}
        />
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-border bg-card px-3 py-3 sm:px-4.5">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-muted md:hidden"
            >
              <HamburgerIcon />
            </button>
            <span className="truncate text-[13px] font-medium tracking-[-0.015em] text-foreground sm:text-[14px]">
              Frozen warehouse launch readiness
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <span className="hidden text-[11.5px] text-muted-foreground sm:inline">
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
        <main className="min-w-0 flex-1 bg-background">{children}</main>
      </div>
    </div>
  );
}
