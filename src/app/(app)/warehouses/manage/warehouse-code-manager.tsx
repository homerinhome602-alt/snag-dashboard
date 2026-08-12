"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createWarehouseCode } from "./actions";
import { WarehouseRow, type WarehouseActivityRow } from "./warehouse-row";
import { StatusFilter, type StatusFilterValue } from "./status-filter";

type Warehouse = { id: string; name: string; is_active: boolean };

export function WarehouseCodeManager({
  warehouses,
  activityByWarehouse,
}: {
  warehouses: Warehouse[];
  activityByWarehouse: Record<string, WarehouseActivityRow[]>;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [creating, startCreate] = useTransition();
  const [createError, setCreateError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");

  function submit() {
    setCreateError(null);
    startCreate(async () => {
      const result = await createWarehouseCode(code);
      if (result.error) {
        setCreateError(result.error);
        return;
      }
      setCode("");
      router.refresh();
    });
  }

  const filtered =
    statusFilter === "all"
      ? warehouses
      : warehouses.filter((w) => (w.is_active ? "active" : "deactivated") === statusFilter);

  return (
    <div>
      <div className="mb-5 rounded-card border border-border bg-card p-4">
        <label className="mb-1.5 block text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
          Add new warehouse code
        </label>
        <div className="flex flex-wrap gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Warehouse code"
            className="max-w-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
          <Button type="button" disabled={creating || !code.trim()} onClick={submit}>
            {creating ? "Creating…" : "Create new warehouse"}
          </Button>
        </div>
        {createError && <p className="mt-1.5 text-[12.5px] text-destructive">{createError}</p>}
      </div>

      <div className="mb-3">
        <StatusFilter value={statusFilter} onChange={setStatusFilter} />
      </div>

      <div className="overflow-hidden rounded-card border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[9px] uppercase tracking-[0.07em] text-faint">
                Warehouse code
              </TableHead>
              <TableHead className="text-[9px] uppercase tracking-[0.07em] text-faint">
                Current status
              </TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No warehouses match this filter.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((w) => (
              <WarehouseRow key={w.id} warehouse={w} activity={activityByWarehouse[w.id] ?? []} />
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-[12.5px] text-muted-foreground">
        Click a row to see its status history.
      </p>
    </div>
  );
}
