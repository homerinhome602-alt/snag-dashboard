import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

export function SnagTable({ snags }: { snags: SnagRow[] }) {
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
            {["S.No", "Raised", "Raised by", "Description", "Category", "Sub-category", "Location", "Scope", "Severity", "Status", "ETC", "Age"].map(
              (h) => (
                <TableHead key={h} className="whitespace-nowrap text-[9px] uppercase tracking-[0.07em] text-faint">
                  {h}
                </TableHead>
              )
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {snags.map((s) => {
            const days = ageingDays(s.date_raised, s.closed_at);
            const overdue = isOverdue(s.etc_date, s.status);
            const subCategory =
              s.sub_category === "others" && s.sub_category_other
                ? s.sub_category_other
                : SUB_CATEGORY_LABELS[s.sub_category] ?? s.sub_category;
            return (
              <TableRow key={s.id}>
                <TableCell className="font-mono text-[11px] text-muted-foreground">
                  {String(s.serial_no).padStart(3, "0")}
                </TableCell>
                <TableCell className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                  {new Date(s.date_raised + "T00:00:00").toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                  })}
                </TableCell>
                <TableCell className="whitespace-nowrap text-[12px]">
                  {s.raised_by_profile?.full_name ?? s.raised_by_profile?.email ?? "—"}
                </TableCell>
                <TableCell className="min-w-[220px] text-[12.5px] text-foreground">
                  {s.description}
                </TableCell>
                <TableCell className="whitespace-nowrap text-[12px] text-muted-foreground">
                  {CATEGORY_LABELS[s.category] ?? s.category}
                </TableCell>
                <TableCell className="whitespace-nowrap text-[12px] text-muted-foreground">
                  {subCategory}
                </TableCell>
                <TableCell className="whitespace-nowrap text-[12px] text-muted-foreground">
                  {LOCATION_LABELS[s.location] ?? s.location}
                </TableCell>
                <TableCell className="whitespace-nowrap text-[12px] text-muted-foreground">
                  {SCOPE_LABELS[s.scope] ?? s.scope}
                </TableCell>
                <TableCell>
                  <span
                    className={`rounded-chip px-1.5 py-0.5 text-[10px] font-medium ${SEVERITY_CHIP[s.severity]}`}
                  >
                    {SEVERITY_LABELS[s.severity] ?? s.severity}
                  </span>
                </TableCell>
                <TableCell>
                  <span
                    className={`rounded-chip px-1.5 py-0.5 text-[10px] font-medium ${STATUS_CHIP[s.status]}`}
                  >
                    {STATUS_LABELS[s.status] ?? s.status}
                  </span>
                </TableCell>
                <TableCell className={`whitespace-nowrap font-mono text-[11px] ${overdue ? "text-red" : "text-muted-foreground"}`}>
                  {s.etc_date
                    ? new Date(s.etc_date + "T00:00:00").toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                      })
                    : "not set"}
                </TableCell>
                <TableCell className={`whitespace-nowrap font-mono text-[11px] ${ageingClass(days)}`}>
                  {days}d
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
