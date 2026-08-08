import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SnagRow, type UpdateRow, type AttachmentRow } from "@/components/snag-row";
import { cn } from "@/lib/utils";
import { STICKY_SNO_CLASS, STICKY_DATE_CLASS, STICKY_DESC_CLASS } from "@/lib/table-sticky";

export type SnagRow = {
  id: string;
  serial_no: number;
  date_raised: string;
  description: string;
  category: string;
  sub_category: string;
  sub_category_other: string | null;
  location: string;
  scope: string;
  severity: string;
  status: string;
  etc_date: string | null;
  closed_at: string | null;
  raised_by_profile: { full_name: string | null; email: string } | null;
};

const HEADERS = [
  "S.No", "Raised", "Description", "Raised by", "Category", "Sub-category",
  "Location", "Scope", "Severity", "Status", "Update", "ETC", "Age",
];

export function SnagTable({
  snags,
  updatesBySnag,
  attachmentsBySnag,
  warehouseId,
  isReporter,
  isResolver,
  currentUserId,
}: {
  snags: SnagRow[];
  updatesBySnag: Record<string, UpdateRow[]>;
  attachmentsBySnag: Record<string, AttachmentRow[]>;
  warehouseId: string;
  isReporter: boolean;
  isResolver: boolean;
  currentUserId: string;
}) {
  if (snags.length === 0) {
    return (
      <div className="rounded-card border border-border bg-card p-6 text-center text-[13px] text-muted-foreground">
        No snags match this filter.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            {HEADERS.map((h) => (
              <TableHead
                key={h}
                className={cn(
                  "whitespace-nowrap text-[9px] uppercase tracking-[0.07em] text-faint",
                  h === "S.No" && STICKY_SNO_CLASS,
                  h === "Raised" && STICKY_DATE_CLASS,
                  h === "Description" && STICKY_DESC_CLASS
                )}
              >
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {snags.map((s) => (
            <SnagRow
              key={s.id}
              snag={s}
              updates={updatesBySnag[s.id] ?? []}
              attachments={attachmentsBySnag[s.id] ?? []}
              warehouseId={warehouseId}
              isReporter={isReporter}
              isResolver={isResolver}
              currentUserId={currentUserId}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
