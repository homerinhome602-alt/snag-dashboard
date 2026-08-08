"use client";

import { useState, useTransition } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  CATEGORY_LABELS,
  LOCATION_LABELS,
  SCOPE_LABELS,
  SEVERITY_CHIP,
  SEVERITY_LABELS,
  STATUS_CHIP,
  STATUS_LABELS,
  SUB_CATEGORY_LABELS,
  ageingClass,
  ageingDays,
  isOverdue,
} from "@/lib/snags";
import { postSnagUpdate, verifySnagClosure } from "@/app/(app)/warehouses/[id]/snag-actions";
import type { SnagRow as SnagRowData } from "@/components/snag-table";

export type UpdateRow = {
  id: string;
  body: string;
  created_at: string;
  author: { full_name: string | null; email: string } | null;
};

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function UpdateForm({ warehouseId, snagId }: { warehouseId: string; snagId: string }) {
  const [body, setBody] = useState("");
  const [etc, setEtc] = useState("");
  const [nextStatus, setNextStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-md border border-border bg-background p-2.5">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Motor replaced. Ran two defrost cycles, no fault."
        className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-[12.5px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          ETC
          <input
            type="date"
            value={etc}
            onChange={(e) => setEtc(e.target.value)}
            className="rounded-md border border-input bg-card px-1.5 py-0.5 text-[11px]"
          />
        </label>
        <select
          value={nextStatus}
          onChange={(e) => setNextStatus(e.target.value)}
          className="rounded-md border border-input bg-card px-1.5 py-0.5 text-[11px]"
        >
          <option value="">Keep status</option>
          <option value="wip">Move to WIP</option>
          <option value="ready_to_close">Move to Verify</option>
        </select>
        <Button
          size="sm"
          className="ml-auto"
          disabled={pending || !body.trim()}
          onClick={() =>
            startTransition(async () => {
              const result = await postSnagUpdate(warehouseId, snagId, body, etc || null, nextStatus || null);
              if (result.error) {
                setError(result.error);
                return;
              }
              setError(null);
              setBody("");
              setEtc("");
              setNextStatus("");
            })
          }
        >
          {pending ? "Posting…" : "Post update"}
        </Button>
      </div>
      {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

function VerifyActions({ warehouseId, snagId }: { warehouseId: string; snagId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2 rounded-md border border-mint bg-mint p-2.5">
      <span className="text-[12px] text-mint-deep">Ready to close — confirm the fix on the floor?</span>
      <div className="ml-auto flex gap-1.5">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => startTransition(async () => {
            const r = await verifySnagClosure(warehouseId, snagId, false);
            if (r.error) setError(r.error);
          })}
        >
          Reject — reopen
        </Button>
        <Button
          size="sm"
          disabled={pending}
          onClick={() => startTransition(async () => {
            const r = await verifySnagClosure(warehouseId, snagId, true);
            if (r.error) setError(r.error);
          })}
        >
          Confirm closed
        </Button>
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

export function SnagRow({
  snag: s,
  updates,
  warehouseId,
  isReporter,
  isResolver,
}: {
  snag: SnagRowData;
  updates: UpdateRow[];
  warehouseId: string;
  isReporter: boolean;
  isResolver: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const days = ageingDays(s.date_raised, s.closed_at);
  const overdue = isOverdue(s.etc_date, s.status);
  const subCategory =
    s.sub_category === "others" && s.sub_category_other
      ? s.sub_category_other
      : SUB_CATEGORY_LABELS[s.sub_category] ?? s.sub_category;
  const latest = updates[updates.length - 1];

  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <TableCell className="font-mono text-[11px] text-muted-foreground">
          {String(s.serial_no).padStart(3, "0")}
        </TableCell>
        <TableCell className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
          {fmtDate(s.date_raised)}
        </TableCell>
        <TableCell className="whitespace-nowrap text-[12px]">
          {s.raised_by_profile?.full_name ?? s.raised_by_profile?.email ?? "—"}
        </TableCell>
        <TableCell className="min-w-[220px] text-[12.5px] text-foreground">{s.description}</TableCell>
        <TableCell className="whitespace-nowrap text-[12px] text-muted-foreground">
          {CATEGORY_LABELS[s.category] ?? s.category}
        </TableCell>
        <TableCell className="whitespace-nowrap text-[12px] text-muted-foreground">{subCategory}</TableCell>
        <TableCell className="whitespace-nowrap text-[12px] text-muted-foreground">
          {LOCATION_LABELS[s.location] ?? s.location}
        </TableCell>
        <TableCell className="whitespace-nowrap text-[12px] text-muted-foreground">
          {SCOPE_LABELS[s.scope] ?? s.scope}
        </TableCell>
        <TableCell>
          <span className={`rounded-chip px-1.5 py-0.5 text-[10px] font-medium ${SEVERITY_CHIP[s.severity]}`}>
            {SEVERITY_LABELS[s.severity] ?? s.severity}
          </span>
        </TableCell>
        <TableCell>
          <span className={`rounded-chip px-1.5 py-0.5 text-[10px] font-medium ${STATUS_CHIP[s.status]}`}>
            {STATUS_LABELS[s.status] ?? s.status}
          </span>
        </TableCell>
        <TableCell className="min-w-[160px] text-[11px]">
          {latest ? (
            <>
              <div className="truncate text-[11.5px] text-foreground">{latest.body}</div>
              <div className="font-mono text-[9.5px] text-faint">
                {updates.length} update{updates.length === 1 ? "" : "s"}
              </div>
            </>
          ) : (
            <span className="text-faint">No updates yet</span>
          )}
        </TableCell>
        <TableCell className={`whitespace-nowrap font-mono text-[11px] ${overdue ? "text-red" : "text-muted-foreground"}`}>
          {s.etc_date ? fmtDate(s.etc_date) : "not set"}
        </TableCell>
        <TableCell className={`whitespace-nowrap font-mono text-[11px] ${ageingClass(days)}`}>{days}d</TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={12} className="bg-background">
            <div className="flex flex-col gap-2 py-1" onClick={(e) => e.stopPropagation()}>
              {updates.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {updates.map((u) => (
                    <div key={u.id} className="text-[12px]">
                      <span className="text-foreground">{u.body}</span>{" "}
                      <span className="font-mono text-[10px] text-faint">
                        · {u.author?.full_name ?? u.author?.email ?? "—"} ·{" "}
                        {new Date(u.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-muted-foreground">No updates yet.</p>
              )}
              {isResolver && <UpdateForm warehouseId={warehouseId} snagId={s.id} />}
              {isReporter && s.status === "ready_to_close" && (
                <VerifyActions warehouseId={warehouseId} snagId={s.id} />
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
