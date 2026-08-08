"use client";

import { useState } from "react";
import { AddWarehouseForm } from "./add-warehouse-form";
import { ManageExistingForm } from "./manage-existing-form";
import type { MemberRole } from "@/lib/roles";

type Person = { id: string; full_name: string | null; email: string; default_role: MemberRole | null };
type Warehouse = { id: string; name: string };

export function ManagementTabs({
  people,
  warehouses,
  currentUserId,
}: {
  people: Person[];
  warehouses: Warehouse[];
  currentUserId: string;
}) {
  const [tab, setTab] = useState<"new" | "existing">("new");

  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-line-soft">
        {(["new", "existing"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-[12.5px] ${
              tab === t
                ? "border-b-2 border-primary font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "new" ? "Add new" : "Manage existing"}
          </button>
        ))}
      </div>

      {tab === "new" ? (
        <>
          <p className="mb-4 text-[12px] text-muted-foreground">
            Tag the people who&apos;ll work on it. Each role can hold more than one person. The
            go-live date is set later, from the warehouse screen, by anyone in a resolver role.
          </p>
          <AddWarehouseForm people={people} currentUserId={currentUserId} />
        </>
      ) : (
        <ManageExistingForm warehouses={warehouses} people={people} />
      )}
    </div>
  );
}
