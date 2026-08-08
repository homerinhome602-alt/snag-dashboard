import { Button } from "@/components/ui/button";
import { STATUS_CHIP, STATUS_LABELS } from "@/lib/snags";
import type { DuplicateCandidate } from "@/app/(app)/warehouses/[id]/snags/new/actions";

// PLAN.md §7: candidates ranked by description similarity within the same
// warehouse/location/sub-category, shown before the snag is written.
export function DuplicateCheckModal({
  candidates,
  pending,
  onCancel,
  onRaiseAnyway,
}: {
  candidates: DuplicateCandidate[];
  pending: boolean;
  onCancel: () => void;
  onRaiseAnyway: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-card border border-border bg-card p-4">
        <h2 className="text-[14px] font-medium text-foreground">Possible duplicate</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          {candidates.length === 1 ? "This looks similar to an" : "These look similar to"} open snag
          {candidates.length === 1 ? "" : "s"} already raised at this location.
        </p>
        <div className="mt-3 flex max-h-64 flex-col gap-2 overflow-y-auto">
          {candidates.map((c) => (
            <div key={c.id} className="rounded-md border border-border p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10.5px] text-faint">#{String(c.serial_no).padStart(3, "0")}</span>
                <span className={`rounded-chip px-1.5 py-0.5 text-[10px] font-medium ${STATUS_CHIP[c.status]}`}>
                  {STATUS_LABELS[c.status] ?? c.status}
                </span>
              </div>
              <p className="mt-1 text-[12.5px] text-foreground">{c.description}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Raised by {c.raised_by_name ?? "—"}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            Cancel — it&apos;s the same issue
          </Button>
          <Button type="button" disabled={pending} onClick={onRaiseAnyway}>
            {pending ? "Raising…" : "Raise anyway"}
          </Button>
        </div>
      </div>
    </div>
  );
}
