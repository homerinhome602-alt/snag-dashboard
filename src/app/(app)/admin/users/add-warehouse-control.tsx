"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiSelectFilter } from "@/components/multi-select-filter";
import { MEMBER_ROLES, roleLabel, type MemberRole } from "@/lib/roles";
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
  const [role, setRole] = useState<string | null>(null);
  const [warehouseIds, setWarehouseIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setOpen(false);
    setRole(null);
    setWarehouseIds([]);
    setError(null);
  }

  function submit() {
    if (!role || warehouseIds.length === 0) {
      setError("Pick a role and at least one warehouse.");
      return;
    }
    startTransition(async () => {
      const result = await addWarehouseMembership(userId, role as MemberRole, warehouseIds);
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
        <Select onValueChange={(v) => setRole(v as string)}>
          <SelectTrigger className="w-40" size="sm">
            <SelectValue>{(value: string | null) => (value ? roleLabel(value) : "Role")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {MEMBER_ROLES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <MultiSelectFilter
          label="Warehouse"
          emptySuffix=""
          options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
          selected={warehouseIds}
          onChange={setWarehouseIds}
          onSelectAll={() => setWarehouseIds(warehouses.map((w) => w.id))}
        />

        <Button type="button" size="sm" disabled={pending} onClick={submit}>
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
