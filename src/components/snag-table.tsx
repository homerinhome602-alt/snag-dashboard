import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SnagRow, type UpdateRow, type AttachmentRow } from "@/components/snag-row";

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
  "S.No", "Raised", "Raised by", "Description", "Category", "Sub-category",
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
              <TableHead key={h} className="whitespace-nowrap text-[9px] uppercase tracking-[0.07em] text-faint">
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
