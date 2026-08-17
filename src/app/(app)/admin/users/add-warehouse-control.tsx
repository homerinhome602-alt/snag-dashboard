"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { MultiSelectFilter } from "@/components/multi-select-filter";
import { addWarehouseMembership } from "./actions";

type Warehouse = { id: string; name: string };

export function AddWarehouseControl({
  userId,
  warehouses,
}: {
  userId: string;
  warehouses: Warehouse[];
}) {
  const [open, setOpen] = useState(false);
  const [warehouseIds, setWarehouseIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setOpen(false);
    setWarehouseIds([]);
    setError(null);
  }

  function submit() {
    if (warehouseIds.length === 0) {
      setError("Pick at least one warehouse.");
      return;
    }
    startTransition(async () => {
      const result = await addWarehouseMembership(userId, warehouseIds);
      if (result.error) {
        setError(result.error);
        return;
      }
      reset();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-0.5 text-[11px] text-primary hover:underline"
      >
        + Add warehouse
      </button>
    );
  }

  return (
    <div className="mt-1 flex flex-col items-start gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {/* No role picker — a person holds exactly one role, set at invite
            time (profiles.default_role); this control only adds warehouse
            tags under that existing role. */}
        <MultiSelectFilter
          label="Warehouse"
          emptySuffix=""
          options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
          selected={warehouseIds}
          onChange={setWarehouseIds}
          onSelectAll={() => setWarehouseIds(warehouses.map((w) => w.id))}
        />

        <Button type="button" size="sm" disabled={pending || warehouseIds.length === 0} onClick={submit}>
          {pending ? "Adding…" : "Add"}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={reset}>
          Cancel
        </Button>
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
