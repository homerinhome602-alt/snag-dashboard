"use client";

import { useMemo, useState } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
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
import {
  CATEGORY_LABELS,
  LOCATION_LABELS,
  SCOPE_LABELS,
  SEVERITY_LABELS,
  STATUS_LABELS,
  SUB_CATEGORY_LABELS,
  ageingDays,
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
  raised_by: string;
  raised_by_profile: { full_name: string | null; email: string } | null;
};

const HEADERS = [
  "S.No", "Raised", "Description", "Raised by", "Category", "Sub-category",
  "Location", "Scope", "Severity", "Status", "Update", "ETC", "Age",
];

type SortKey =
  | "serial_no" | "date_raised" | "description" | "raised_by" | "category"
  | "sub_category" | "location" | "scope" | "severity" | "status" | "update"
  | "etc_date" | "age";
type SortDir = "asc" | "desc";

const HEADER_SORT_KEY: Record<string, SortKey> = {
  "S.No": "serial_no",
  "Raised": "date_raised",
  "Description": "description",
  "Raised by": "raised_by",
  "Category": "category",
  "Sub-category": "sub_category",
  "Location": "location",
  "Scope": "scope",
  "Severity": "severity",
  "Status": "status",
  "Update": "update",
  "ETC": "etc_date",
  "Age": "age",
};

// SEVERITY_LABELS/STATUS_LABELS are already declared high→low and
// open→closed, so their key order doubles as the rank a sort should use —
// no separate rank table to keep in sync.
const SEVERITY_RANK = Object.fromEntries(Object.keys(SEVERITY_LABELS).map((k, i) => [k, i]));
const STATUS_RANK = Object.fromEntries(Object.keys(STATUS_LABELS).map((k, i) => [k, i]));

function sortValue(s: SnagRow, key: SortKey, updates: UpdateRow[]): string | number | null {
  switch (key) {
    case "serial_no":
      return s.serial_no;
    case "date_raised":
      return s.date_raised;
    case "description":
      return s.description.toLowerCase();
    case "raised_by":
      return (s.raised_by_profile?.full_name ?? s.raised_by_profile?.email ?? "").toLowerCase();
    case "category":
      return (CATEGORY_LABELS[s.category] ?? s.category).toLowerCase();
    case "sub_category":
      return (
        s.sub_category === "others" && s.sub_category_other
          ? s.sub_category_other
          : SUB_CATEGORY_LABELS[s.sub_category] ?? s.sub_category
      ).toLowerCase();
    case "location":
      return (LOCATION_LABELS[s.location] ?? s.location).toLowerCase();
    case "scope":
      return (SCOPE_LABELS[s.scope] ?? s.scope).toLowerCase();
    case "severity":
      return SEVERITY_RANK[s.severity] ?? 99;
    case "status":
      return STATUS_RANK[s.status] ?? 99;
    case "update": {
      const latest = updates[updates.length - 1];
      return latest ? latest.created_at : null;
    }
    case "etc_date":
      return s.etc_date;
    case "age":
      return ageingDays(s.date_raised, s.closed_at);
  }
}

function SortIcon({ dir }: { dir: SortDir | null }) {
  if (dir === "asc") return <ArrowUp className="size-3" />;
  if (dir === "desc") return <ArrowDown className="size-3" />;
  return <ArrowUpDown className="size-3 opacity-40" />;
}

export function SnagTable({
  snags,
  updatesBySnag,
  attachmentsBySnag,
  activityBySnag,
  warehouseId,
  hasReporterTag,
  hasResolverTag,
  isDashboardAdmin,
  rolesByUserId,
  adminUserIds,
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
  rolesByUserId: Record<string, string[]>;
  adminUserIds: string[];
  currentUserId: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir | null>(null);

  // Third click on the same column resets to the table's normal order
  // (serial_no descending, as fetched) rather than cycling forever.
  function toggleSort(key: SortKey) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey(null);
      setSortDir(null);
    }
  }

  const sortedSnags = useMemo(() => {
    if (!sortKey || !sortDir) return snags;
    const withKeys = snags.map((s) => ({ s, v: sortValue(s, sortKey, updatesBySnag[s.id] ?? []) }));
    withKeys.sort((a, b) => {
      // Nulls (e.g. no ETC set, no updates yet) always sort last,
      // regardless of direction, so they don't jump to the top on desc.
      if (a.v === null) return b.v === null ? 0 : 1;
      if (b.v === null) return -1;
      if (a.v < b.v) return sortDir === "asc" ? -1 : 1;
      if (a.v > b.v) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return withKeys.map((x) => x.s);
  }, [snags, updatesBySnag, sortKey, sortDir]);

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
            {HEADERS.map((h) => {
              const key = HEADER_SORT_KEY[h];
              const dir = sortKey === key ? sortDir : null;
              return (
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
                    h === "Description" && cn(STICKY_DESC_CLASS, "bg-line"),
                    // Wraps onto multiple lines in the body instead of
                    // truncating, so a fixed width here just bounds the
                    // column rather than clipping the update text.
                    h === "Update" && "w-[380px] min-w-[380px] max-w-[380px]",
                    // Caps long names/emails so one long value doesn't blow
                    // out the column's width relative to the rest of the row.
                    h === "Raised by" && "max-w-[130px]"
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex items-center gap-1",
                      (h === "Severity" || h === "Status") && "justify-center"
                    )}
                  >
                    {h}
                    <button
                      type="button"
                      onClick={() => toggleSort(key)}
                      aria-label={`Sort by ${h}`}
                      className="rounded p-0.5 text-faint hover:bg-muted hover:text-foreground"
                    >
                      <SortIcon dir={dir} />
                    </button>
                  </span>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedSnags.map((s) => (
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
              rolesByUserId={rolesByUserId}
              adminUserIds={adminUserIds}
              currentUserId={currentUserId}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
