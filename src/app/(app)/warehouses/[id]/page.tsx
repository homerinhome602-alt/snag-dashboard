import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/data/server";
import { Button } from "@/components/ui/button";
import { SnagTable, type SnagRow } from "@/components/snag-table";
import type { UpdateRow, AttachmentRow, ActivityRow } from "@/components/snag-row";
import { TeamBlock } from "@/components/team-block";
import { BurnUpChart } from "@/components/burn-up-chart";
import { ExportButton } from "@/components/export-button";
import { REPORTER_ROLES, RESOLVER_ROLES, roleLabel, isEffectiveAdmin } from "@/lib/roles";
import { daysUntil } from "@/lib/readiness";
import { GoLiveEditor } from "./go-live-editor";
import { GoLiveHistoryInfo, type GoLiveChange } from "./go-live-history-info";
import { SnagFilters } from "./snag-filters";
import { SearchBox } from "./search-box";
import { RaisedBanner } from "./raised-banner";
import {
  HandoverDocuments,
  type HandoverDocRow,
  type HandoverHistoryEntry,
} from "./handover-documents";
import { ChamberDetails, type ChamberRow } from "./chamber-details";
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

  const [
    { data: w },
    { data: membership },
    { data: teamRows },
    { data: snapshots },
    { data: me },
    { data: allProfiles },
    { data: goLiveChanges },
    { data: docTypes },
    { data: whDocs },
    { data: chamberDataRows },
    { data: handoverActivity },
  ] = await Promise.all([
    supabase
      .from("warehouse_readiness")
      .select("id, name, go_live_date, total_raised, open_count, open_high_count")
      .eq("id", id)
      .single(),
    supabase.from("warehouse_members").select("role").eq("warehouse_id", id).eq("user_id", uid ?? ""),
    supabase
      .from("warehouse_members")
      .select("user_id, role, profile:profiles(full_name, email)")
      .eq("warehouse_id", id),
    supabase
      .from("snag_daily_snapshot")
      .select("snapshot_date, total_raised, total_closed")
      .eq("warehouse_id", id)
      .order("snapshot_date"),
    supabase.from("profiles").select("is_dashboard_admin, is_active").eq("id", uid ?? "").maybeSingle(),
    supabase.from("profiles").select("id, is_dashboard_admin, full_name, email"),
    supabase
      .from("warehouse_activity")
      .select("id, old_value, new_value, created_at, actor:profiles(full_name, email)")
      .eq("warehouse_id", id)
      .eq("action", "go_live_date_change")
      .order("created_at", { ascending: false }),
    supabase.from("handover_document_types").select("id, name, sort_order").order("sort_order"),
    supabase
      .from("warehouse_handover_documents")
      .select("doc_type_id, file_url, file_name, checked, uploaded_by, checked_by")
      .eq("warehouse_id", id),
    supabase
      .from("warehouse_chambers")
      .select(
        "id, chamber_name, machine_count, machine_capacity_kw, odu_model, idu_model, controller_model, updated_by"
      )
      .eq("warehouse_id", id)
      .order("created_at"),
    supabase
      .from("warehouse_asset_activity")
      .select("id, action, ref_label, detail, created_at, actor:profiles(full_name, email)")
      .eq("warehouse_id", id)
      .eq("area", "handover_document")
      .order("created_at", { ascending: false }),
  ]);

  if (!w) notFound();

  // Dashboard Admin bypasses the reporter/resolver tag on snag actions the
  // same way it already bypasses read scoping — matches the RPC-level
  // check in raise_snag/post_snag_update/verify_snag_closure/close_snag_directly.
  // In practice a deactivated viewer never reaches this line at all — `w`
  // above comes back null and 404s first, since warehouses_select_scoped is
  // properly is_active-gated — but isEffectiveAdmin keeps this consistent
  // with every other such check rather than being the one silent exception.
  const isDashboardAdmin = isEffectiveAdmin(me);
  // Real membership, not bypass-merged — the chat compose box needs to tell
  // "genuinely tagged both reporter and resolver" apart from "admin with no
  // tag at all," which an isReporter/isResolver OR'd with admin can't do.
  // Reporter/Resolver are labels only now — any tagged member can do every snag
  // task. The real tags are still tracked (they set the person's default side in
  // the chat feed), but they no longer gate anything.
  const hasReporterTag = (membership ?? []).some((m) => REPORTER_ROLES.includes(m.role));
  const hasResolverTag = (membership ?? []).some((m) => RESOLVER_ROLES.includes(m.role));
  const isMember = (membership ?? []).length > 0;
  const canManage = isMember || isDashboardAdmin;
  const isReporter = canManage;
  const isResolver = canManage;
  const daysToGoLive = daysUntil(w.go_live_date);
  const team = (teamRows ?? []).map((t) => ({
    role: t.role,
    full_name: (t.profile as unknown as { full_name: string | null; email: string } | null)?.full_name ?? null,
    email: (t.profile as unknown as { full_name: string | null; email: string } | null)?.email ?? "",
  }));

  // Lets the chat feed show a message's author's actual operational role
  // (e.g. "HVAC Engineer") instead of just the generic reporter/resolver
  // bucket. A person can hold more than one role on this warehouse, so this
  // is a list per user, joined at render time.
  const rolesByUserId: Record<string, string[]> = {};
  for (const t of teamRows ?? []) {
    (rolesByUserId[t.user_id] ??= []).push(roleLabel(t.role));
  }

  // A message's role badge should say "Dashboard Admin" for someone who
  // posted via the admin bypass with no real tag here — not the generic
  // reporter/resolver bucket label, which isn't true of them. Needed
  // separately from rolesByUserId since admin status is global, not scoped
  // to this warehouse's membership rows.
  const adminUserIds = (allProfiles ?? []).filter((p) => p.is_dashboard_admin).map((p) => p.id);

  // ── Handover documents + Machine/Controller details ───────────────────────
  const profileName = new Map<string, string>(
    (allProfiles ?? []).map((p) => [p.id, (p.full_name as string | null) || (p.email as string)])
  );
  const docByType = new Map(
    (whDocs ?? []).map((d) => [d.doc_type_id as string, d])
  );
  const docPaths = (whDocs ?? []).map((d) => d.file_url).filter(Boolean) as string[];
  const { data: docSignedUrls } = docPaths.length
    ? await supabase.storage.from("attachments").createSignedUrls(docPaths, 3600)
    : { data: [] as { path: string | null; signedUrl: string }[] | null };
  const docUrlByPath = new Map((docSignedUrls ?? []).map((s) => [s.path, s.signedUrl]));

  const handoverRows: HandoverDocRow[] = (docTypes ?? []).map((t) => {
    const d = docByType.get(t.id as string);
    return {
      docTypeId: t.id as string,
      name: t.name as string,
      fileName: (d?.file_name as string | null) ?? null,
      downloadUrl: d?.file_url ? docUrlByPath.get(d.file_url) ?? null : null,
    };
  });

  const handoverHistory: HandoverHistoryEntry[] = (handoverActivity ?? []).map((a) => ({
    id: a.id as string,
    action: a.action as string,
    docName: (a.ref_label as string | null) ?? null,
    fileName: (a.detail as string | null) ?? null,
    at: a.created_at as string,
    by:
      (a.actor as { full_name: string | null; email: string } | null)?.full_name ||
      (a.actor as { full_name: string | null; email: string } | null)?.email ||
      "Someone",
  }));

  const chamberRows: ChamberRow[] = (chamberDataRows ?? []).map((c) => ({
    id: c.id as string,
    chamber_name: c.chamber_name as string,
    machine_count: (c.machine_count as number | null) ?? null,
    machine_capacity_kw: (c.machine_capacity_kw as number | null) ?? null,
    odu_model: (c.odu_model as string | null) ?? null,
    idu_model: (c.idu_model as string | null) ?? null,
    controller_model: (c.controller_model as string | null) ?? null,
    updatedByName: c.updated_by ? profileName.get(c.updated_by as string) ?? null : null,
  }));

  let query = supabase
    .from("snags")
    .select(
      "id, serial_no, date_raised, description, category, sub_category, sub_category_other, location, scope, severity, status, etc_date, closed_at, raised_by, raised_by_profile:profiles!snags_raised_by_fkey(full_name, email)"
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
        .select("id, snag_id, body, author_id, author_side, created_at, author:profiles(full_name, email)")
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
      <div className="mb-3 flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:justify-between">
        <h1 className="text-[21px] font-semibold tracking-[-0.015em] text-foreground">{w.name}</h1>
        {isResolver ? (
          <div className="flex items-baseline gap-1.5 text-[13.5px] text-foreground">
            <span className="text-muted-foreground">Go-live date:</span>
            <GoLiveEditor warehouseId={id} goLiveDate={w.go_live_date} />
            <GoLiveHistoryInfo changes={(goLiveChanges ?? []) as unknown as GoLiveChange[]} />
          </div>
        ) : (
          <span className="flex items-baseline gap-1.5 text-[13px] text-muted-foreground">
            Go-live date:{" "}
            <span className="font-mono text-[11px] text-faint">
              {w.go_live_date
                ? new Date(w.go_live_date + "T00:00:00")
                    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                    .toUpperCase()
                : "NOT SET"}
            </span>
            <GoLiveHistoryInfo changes={(goLiveChanges ?? []) as unknown as GoLiveChange[]} />
          </span>
        )}
      </div>

      <div className="mb-3 mt-2.5 grid grid-cols-1 gap-2.5 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="grid grid-cols-2 auto-rows-fr gap-2">
          {summaryTiles.map((tile) => (
            <div
              key={tile.label}
              className={cn(
                CARD_HOVER,
                "flex items-center gap-2.5 rounded-md border p-2.5 hover:bg-blush",
                tile.highlight ? "border-blush bg-blush" : "border-border bg-card"
              )}
            >
              <div
                className={`font-mono text-[28px] leading-none ${tile.highlight ? "text-red-deep" : ""}`}
              >
                {tile.value}
              </div>
              <div
                className={`text-[11px] leading-[1.2] ${tile.highlight ? "text-red-deep" : "text-faint"}`}
              >
                {tile.label}
              </div>
            </div>
          ))}
          <div
            className={cn(
              CARD_HOVER,
              "col-span-2 flex items-center gap-2.5 rounded-md border border-border bg-card p-2.5 hover:bg-blush"
            )}
          >
            <div className="font-mono text-[28px] leading-none">{daysToGoLive ?? "—"}</div>
            <div className="text-[11px] leading-[1.2] text-faint">Days left for launch</div>
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

      <p className="mb-1.5 text-[12.5px] text-muted-foreground">
        Click a row to expand its update log and see attached photos/videos.
      </p>

      <SnagTable
        snags={(snags ?? []) as unknown as SnagRow[]}
        updatesBySnag={updatesBySnag}
        attachmentsBySnag={attachmentsBySnag}
        activityBySnag={activityBySnag}
        warehouseId={id}
        hasReporterTag={hasReporterTag}
        hasResolverTag={hasResolverTag}
        isDashboardAdmin={isDashboardAdmin}
        canManage={canManage}
        rolesByUserId={rolesByUserId}
        adminUserIds={adminUserIds}
        currentUserId={uid ?? ""}
      />

      <div className="mt-3 grid grid-cols-1 gap-2.5">
        <HandoverDocuments
          warehouseId={id}
          canEdit={hasReporterTag || hasResolverTag || isDashboardAdmin}
          rows={handoverRows}
          history={handoverHistory}
        />
        <ChamberDetails
          warehouseId={id}
          canEdit={hasReporterTag || hasResolverTag || isDashboardAdmin}
          chambers={chamberRows}
        />
      </div>

      <div className="mt-3">
        <TeamBlock members={team} />
      </div>
    </div>
  );
}
