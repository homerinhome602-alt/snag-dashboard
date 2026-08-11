import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { SnagTable, type SnagRow } from "@/components/snag-table";
import type { UpdateRow, AttachmentRow, ActivityRow } from "@/components/snag-row";
import { TeamBlock } from "@/components/team-block";
import { BurnUpChart } from "@/components/burn-up-chart";
import { ExportButton } from "@/components/export-button";
import { REPORTER_ROLES, RESOLVER_ROLES } from "@/lib/roles";
import { daysUntil } from "@/lib/readiness";
import { GoLiveEditor } from "./go-live-editor";
import { SnagFilters } from "./snag-filters";
import { SearchBox } from "./search-box";
import { RaisedBanner } from "./raised-banner";
import { parseMulti } from "./filter-utils";
import { cn, CARD_HOVER } from "@/lib/utils";

export default async function WarehouseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    status?: string;
    q?: string;
    raised?: string;
    category?: string;
    sub_category?: string;
    location?: string;
    scope?: string;
    severity?: string;
  }>;
}) {
  const { id } = await params;
  const { status, q = "", raised, category, sub_category, location, scope, severity } =
    await searchParams;
  const statusValues = parseMulti(status);
  const categoryValues = parseMulti(category);
  const subCategoryValues = parseMulti(sub_category);
  const locationValues = parseMulti(location);
  const scopeValues = parseMulti(scope);
  const severityValues = parseMulti(severity);
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getClaims();
  const uid = auth?.claims?.sub;

  const [{ data: w }, { data: membership }, { data: teamRows }, { data: snapshots }] = await Promise.all([
    supabase
      .from("warehouse_readiness")
      .select("id, name, go_live_date, total_raised, open_count, open_high_count")
      .eq("id", id)
      .single(),
    supabase.from("warehouse_members").select("role").eq("warehouse_id", id).eq("user_id", uid ?? ""),
    supabase
      .from("warehouse_members")
      .select("role, profile:profiles(full_name, email)")
      .eq("warehouse_id", id),
    supabase
      .from("snag_daily_snapshot")
      .select("snapshot_date, total_raised, total_closed")
      .eq("warehouse_id", id)
      .order("snapshot_date"),
  ]);

  if (!w) notFound();

  const isReporter = (membership ?? []).some((m) => REPORTER_ROLES.includes(m.role));
  const isResolver = (membership ?? []).some((m) => RESOLVER_ROLES.includes(m.role));
  const daysToGoLive = daysUntil(w.go_live_date);
  const team = (teamRows ?? []).map((t) => ({
    role: t.role,
    full_name: (t.profile as unknown as { full_name: string | null; email: string } | null)?.full_name ?? null,
    email: (t.profile as unknown as { full_name: string | null; email: string } | null)?.email ?? "",
  }));

  let query = supabase
    .from("snags")
    .select(
      "id, serial_no, date_raised, description, category, sub_category, sub_category_other, location, scope, severity, status, etc_date, closed_at, raised_by_profile:profiles!snags_raised_by_fkey(full_name, email)"
    )
    .eq("warehouse_id", id)
    .order("serial_no", { ascending: false });

  if (statusValues.length) query = query.in("status", statusValues);
  if (q) query = query.ilike("description", `%${q}%`);
  if (categoryValues.length) query = query.in("category", categoryValues);
  if (subCategoryValues.length) query = query.in("sub_category", subCategoryValues);
  if (locationValues.length) query = query.in("location", locationValues);
  if (scopeValues.length) query = query.in("scope", scopeValues);
  if (severityValues.length) query = query.in("severity", severityValues);

  const { data: snags } = await query;

  const snagIds = (snags ?? []).map((s) => s.id);
  const { data: updates } = snagIds.length
    ? await supabase
        .from("snag_updates")
        .select("id, snag_id, body, created_at, author:profiles(full_name, email)")
        .in("snag_id", snagIds)
        .order("created_at")
    : { data: [] as never[] };

  const updatesBySnag: Record<string, UpdateRow[]> = {};
  for (const u of updates ?? []) {
    const key = (u as { snag_id: string }).snag_id;
    (updatesBySnag[key] ??= []).push(u as unknown as UpdateRow);
  }

  const { data: attachmentRows } = snagIds.length
    ? await supabase
        .from("attachments")
        .select("id, snag_id, update_id, media_type, thumbnail_url, file_url")
        .in("snag_id", snagIds)
        .order("created_at")
    : { data: [] as never[] };

  const paths = (attachmentRows ?? []).flatMap((a) => [a.thumbnail_url, a.file_url]);
  const { data: signedUrls } = paths.length
    ? await supabase.storage.from("attachments").createSignedUrls(paths, 3600)
    : { data: [] as { path: string | null; signedUrl: string }[] | null };
  const urlByPath = new Map((signedUrls ?? []).map((s) => [s.path, s.signedUrl]));

  const attachmentsBySnag: Record<string, AttachmentRow[]> = {};
  for (const a of attachmentRows ?? []) {
    (attachmentsBySnag[a.snag_id] ??= []).push({
      id: a.id,
      update_id: a.update_id,
      media_type: a.media_type,
      thumbnail_url: urlByPath.get(a.thumbnail_url) ?? "",
      file_url: urlByPath.get(a.file_url) ?? "",
    });
  }

  const { data: activityRows } = snagIds.length
    ? await supabase
        .from("snag_activity")
        .select("id, snag_id, action, field, old_value, new_value, created_at, actor:profiles(full_name, email)")
        .in("snag_id", snagIds)
        .order("created_at")
    : { data: [] as never[] };

  const activityBySnag: Record<string, ActivityRow[]> = {};
  for (const a of activityRows ?? []) {
    const key = (a as { snag_id: string }).snag_id;
    (activityBySnag[key] ??= []).push(a as unknown as ActivityRow);
  }

  const summaryTiles = [
    { label: "Snags Open", value: w.open_count, highlight: false },
    { label: "Snags Closed", value: w.total_raised - w.open_count, highlight: false },
    { label: "Total Snags Raised", value: w.total_raised, highlight: false },
    { label: "Snags Marked High Severity", value: w.open_high_count, highlight: true },
  ];

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 sm:py-8 lg:px-[50px]">
      <div className="mb-3 flex items-baseline justify-between">
        <h1 className="text-[16px] font-medium tracking-[-0.015em] text-foreground">{w.name}</h1>
        {isResolver ? (
          <div className="flex items-baseline gap-1.5 text-[13.5px] text-foreground">
            <span className="text-muted-foreground">Go-live date:</span>
            <GoLiveEditor warehouseId={id} goLiveDate={w.go_live_date} />
          </div>
        ) : (
          <span className="text-[13px] text-muted-foreground">
            Go-live date:{" "}
            <span className="font-mono text-[11px] text-faint">
              {w.go_live_date
                ? new Date(w.go_live_date + "T00:00:00")
                    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                    .toUpperCase()
                : "NOT SET"}
            </span>
          </span>
        )}
      </div>

      <TeamBlock members={team} />

      <div className="mb-3 mt-2.5 grid grid-cols-1 gap-2.5 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="grid grid-cols-2 auto-rows-fr gap-2">
          {summaryTiles.map((tile) => (
            <div
              key={tile.label}
              className={cn(
                CARD_HOVER,
                "rounded-md border p-2.5 hover:bg-blush",
                tile.highlight ? "border-blush bg-blush" : "border-border bg-card"
              )}
            >
              <div className={`font-mono text-[19px] ${tile.highlight ? "text-red-deep" : ""}`}>{tile.value}</div>
              <div className={`text-[9px] ${tile.highlight ? "text-red-deep" : "text-faint"}`}>{tile.label}</div>
            </div>
          ))}
          <div className={cn(CARD_HOVER, "col-span-2 rounded-md border border-border bg-card p-2.5 hover:bg-blush")}>
            <div className="font-mono text-[19px]">{daysToGoLive ?? "—"}</div>
            <div className="text-[9px] text-faint">Days left for launch</div>
          </div>
        </div>
        <BurnUpChart snapshots={snapshots ?? []} goLiveDate={w.go_live_date} liveTotalRaised={w.total_raised} liveTotalClosed={w.total_raised - w.open_count} />
      </div>

      {raised && <RaisedBanner serialNo={raised} />}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SnagFilters />
        <SearchBox />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ExportButton snags={(snags ?? []) as unknown as SnagRow[]} warehouseName={w.name} />
          {isReporter && (
            <>
              <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/warehouses/${id}/import`} />}>
                Import
              </Button>
              <Button size="sm" nativeButton={false} render={<Link href={`/warehouses/${id}/snags/new`} />}>
                Add snag
              </Button>
            </>
          )}
        </div>
      </div>

      <SnagTable
        snags={(snags ?? []) as unknown as SnagRow[]}
        updatesBySnag={updatesBySnag}
        attachmentsBySnag={attachmentsBySnag}
        activityBySnag={activityBySnag}
        warehouseId={id}
        isReporter={isReporter}
        isResolver={isResolver}
        currentUserId={uid ?? ""}
      />

      <p className="mt-3 text-[12.5px] text-muted-foreground">
        Click a row to expand its update log and see attached photos/videos.
      </p>
    </div>
  );
}
