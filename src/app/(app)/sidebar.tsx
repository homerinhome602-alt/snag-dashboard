"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Warehouse = { id: string; name: string };

export function Sidebar({
  warehouses,
  isAdmin,
}: {
  warehouses: Warehouse[];
  isAdmin: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav className="w-46 shrink-0 border-r border-border bg-card py-3.5">
      <div className="px-4 pb-2 text-[10px] uppercase tracking-[0.09em] text-faint">
        Warehouses
      </div>
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
  );
}
