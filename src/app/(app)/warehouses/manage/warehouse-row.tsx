"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { setWarehouseActive } from "./actions";

export type WarehouseActivityRow = {
  id: string;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  actor: { full_name: string | null; email: string } | null;
};

function describeActivity(a: WarehouseActivityRow): string {
  switch (a.action) {
    case "create":
      return "created this warehouse";
    case "activate":
      return "activated this warehouse";
    case "deactivate":
      return "deactivated this warehouse";
    default:
      return a.action.replaceAll("_", " ");
  }
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

export function WarehouseRow({
  warehouse,
  activity,
}: {
  warehouse: { id: string; name: string; is_active: boolean };
  activity: WarehouseActivityRow[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <TableCell className="text-[13px] text-foreground">{warehouse.name}</TableCell>
        <TableCell>
          <Badge
            variant="outline"
            className={
              warehouse.is_active
                ? "border-mint bg-mint text-mint-deep"
                : "border-line-soft bg-line-soft text-muted-foreground"
            }
          >
            {warehouse.is_active ? "Active" : "Deactivated"}
          </Badge>
        </TableCell>
        <TableCell className="text-right">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={(e) => {
              e.stopPropagation();
              setError(null);
              startTransition(async () => {
                const r = await setWarehouseActive(warehouse.id, !warehouse.is_active);
                if (r.error) setError(r.error);
                else router.refresh();
              });
            }}
          >
            {pending ? "Saving…" : warehouse.is_active ? "Deactivate" : "Activate"}
          </Button>
          {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-background hover:bg-background">
          <TableCell colSpan={3} className="whitespace-normal p-3">
            {activity.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">No history yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {activity.map((a) => (
                  <li key={a.id} className="text-[11.5px] text-muted-foreground">
                    <span className="text-foreground">{a.actor?.full_name ?? a.actor?.email ?? "Someone"}</span>{" "}
                    {describeActivity(a)}
                    <span className="font-mono text-[10px] text-faint"> · {fmtDateTime(a.created_at)}</span>
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
