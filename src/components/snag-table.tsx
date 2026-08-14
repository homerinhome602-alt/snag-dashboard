import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SnagRow, type UpdateRow, type AttachmentRow, type ActivityRow } from "@/components/snag-row";
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
  activityBySnag,
  warehouseId,
  hasReporterTag,
  hasResolverTag,
  isDashboardAdmin,
  currentUserId,
}: {
  snags: SnagRow[];
  updatesBySnag: Record<string, UpdateRow[]>;
  attachmentsBySnag: Record<string, AttachmentRow[]>;
  activityBySnag: Record<string, ActivityRow[]>;
  warehouseId: string;
  hasReporterTag: boolean;
  hasResolverTag: boolean;
  isDashboardAdmin: boolean;
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
    <div className="overflow-x-auto rounded-card border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            {HEADERS.map((h) => (
              <TableHead
                key={h}
                className={cn(
                  (h === "Severity" || h === "Status") && "text-center",
                  // Sticky cells paint their own opaque bg-card to hide
                  // content scrolling underneath — override it back to the
                  // header row's fill so they don't show up as a lighter
                  // patch against the rest of the header.
                  h === "S.No" && cn(STICKY_SNO_CLASS, "bg-line"),
                  h === "Raised" && cn(STICKY_DATE_CLASS, "bg-line"),
                  h === "Description" && cn(STICKY_DESC_CLASS, "bg-line")
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
              activity={activityBySnag[s.id] ?? []}
              warehouseId={warehouseId}
              hasReporterTag={hasReporterTag}
              hasResolverTag={hasResolverTag}
              isDashboardAdmin={isDashboardAdmin}
              currentUserId={currentUserId}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
