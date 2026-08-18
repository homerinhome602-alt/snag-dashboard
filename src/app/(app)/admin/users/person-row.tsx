"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { StatusToggle } from "./status-toggle";
import { AddWarehouseControl } from "./add-warehouse-control";

export type PersonActivityRow = {
  id: string;
  action: string;
  detail: string | null;
  created_at: string;
  actor: { full_name: string | null; email: string } | null;
};

type Row = {
  key: string;
  name: string;
  role: string;
  warehouseNames: string[];
  status: "active" | "invited" | "deactivated";
  userId: string | null;
  isDashboardAdmin: boolean;
};

type Warehouse = { id: string; name: string };

function describeActivity(a: PersonActivityRow): string {
  return a.detail ?? a.action.replaceAll("_", " ");
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

export function PersonRow({
  row,
  activity,
  addableWarehouses,
}: {
  row: Row;
  activity: PersonActivityRow[];
  addableWarehouses: Warehouse[];
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <TableCell className="text-[13px] text-foreground">{row.name}</TableCell>
        <TableCell className="text-[13px]">{row.role}</TableCell>
        <TableCell
          className="whitespace-normal text-[12.5px] text-muted-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          {row.warehouseNames.length === 0 ? (
            <span className="block">—</span>
          ) : (
            <div className="flex flex-col gap-0.5">
              {row.warehouseNames.map((n) => (
                <span key={n}>{n}</span>
              ))}
            </div>
          )}
          {row.userId && !row.isDashboardAdmin && (
            <AddWarehouseControl userId={row.userId} warehouses={addableWarehouses} />
          )}
        </TableCell>
        <TableCell className="text-center">
          <Badge
            variant="outline"
            className={
              row.status === "active"
                ? "border-mint bg-mint text-mint-deep"
                : row.status === "invited"
                  ? "border-blush bg-blush text-red-deep"
                  : "border-line-soft bg-line-soft text-muted-foreground"
            }
          >
            {row.status === "active" ? "Active" : row.status === "invited" ? "Invited" : "Deactivated"}
          </Badge>
        </TableCell>
        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
          {row.userId && <StatusToggle userId={row.userId} isActive={row.status === "active"} />}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-background hover:bg-background">
          <TableCell colSpan={5} className="whitespace-normal p-3">
            {activity.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">No history yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {activity.map((a) => (
                  <li key={a.id} className="text-[11.5px] text-muted-foreground">
                    <span className="font-mono text-[10px] text-faint">{fmtDateTime(a.created_at)}</span>{" "}
                    · <span className="text-foreground">{a.actor?.full_name ?? a.actor?.email ?? "Someone"}</span>{" "}
                    {describeActivity(a)}
                  </li>
                ))}
              </ul>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
