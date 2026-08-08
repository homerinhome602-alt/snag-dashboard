import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { SnagTable, type SnagRow } from "@/components/snag-table";
import type { UpdateRow, AttachmentRow } from "@/components/snag-row";
import { TeamBlock } from "@/components/team-block";
import { BurnUpChart } from "@/components/burn-up-chart";
import { ExportButton } from "@/components/export-button";
import { STATUS_LABELS } from "@/lib/snags";
import { REPORTER_ROLES, RESOLVER_ROLES } from "@/lib/roles";
import { daysUntil } from "@/lib/readiness";
import { GoLiveEditor } from "./go-live-editor";

const STATUS_FILTERS = ["all", "open", "wip", "ready_to_close", "closed"] as const;

export default async function WarehouseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; q?: string; raised?: string }>;
}) {
  const { id } = await params;
  const { status = "all", q = "", raised } = await searchParams;
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

  if (status !== "all") {
    query = query.eq("status", status);
  }
  if (q) {
    query = query.ilike("description", `%${q}%`);
  }

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

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h1 className="text-[16px] font-medium tracking-[-0.015em] text-foreground">{w.name}</h1>
        {isResolver ? (
          <GoLiveEditor warehouseId={id} goLiveDate={w.go_live_date} />
        ) : (
          <span className="font-mono text-[11px] text-faint">
            {w.go_live_date
              ? `GO-LIVE ${new Date(w.go_live_date + "T00:00:00")
                  .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                  .toUpperCase()}`
              : "GO-LIVE NOT SET"}
          </span>
        )}
      </div>

      <TeamBlock members={team} />

      <div className="mb-3 mt-2.5 grid grid-cols-[0.85fr_1.15fr] gap-2.5">
        <div className="grid grid-cols-2 content-start gap-2">
          <div className="rounded-md border border-border bg-card p-2.5">
            <div className="font-mono text-[19px]">{w.total_raised}</div>
            <div className="text-[9px] text-faint">raised</div>
          </div>
          <div className="rounded-md border border-border bg-card p-2.5">
            <div className="font-mono text-[19px]">{w.open_count}</div>
            <div className="text-[9px] text-faint">open</div>
          </div>
          <div className="rounded-md border border-border bg-card p-2.5">
            <div className="font-mono text-[19px]">{w.total_raised - w.open_count}</div>
            <div className="text-[9px] text-faint">closed</div>
          </div>
          <div className="rounded-md border border-blush bg-blush p-2.5">
            <div className="font-mono text-[19px] text-red-deep">{w.open_high_count}</div>
            <div className="text-[9px] text-red-deep">open high</div>
          </div>
          <div className="col-span-2 rounded-md border border-border bg-card p-2.5">
            <div className="font-mono text-[19px]">{daysToGoLive ?? "—"}</div>
            <div className="text-[9px] text-faint">days left</div>
          </div>
        </div>
        <BurnUpChart snapshots={snapshots ?? []} goLiveDate={w.go_live_date} />
      </div>

      {raised && (
        <div className="mb-3 rounded-md border border-mint bg-mint px-3 py-2 text-[12.5px] text-mint-deep">
          Snag #{String(raised).padStart(3, "0")} raised.
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((s) => (
          <Link
            key={s}
            href={`/warehouses/${id}?${new URLSearchParams({ ...(q ? { q } : {}), status: s })}`}
            className={`rounded-pill border px-2.5 py-1 text-[11.5px] ${
              status === s
                ? "border-primary bg-accent text-accent-foreground"
                : "border-border bg-card text-muted-foreground"
            }`}
          >
            {s === "all" ? "All" : STATUS_LABELS[s]}
          </Link>
        ))}
        <form className="ml-auto flex items-center gap-2" action={`/warehouses/${id}`}>
          <input type="hidden" name="status" value={status} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search description…"
            className="rounded-md border border-input bg-background px-2.5 py-1 text-[12px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </form>
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

      <SnagTable
        snags={(snags ?? []) as unknown as SnagRow[]}
        updatesBySnag={updatesBySnag}
        attachmentsBySnag={attachmentsBySnag}
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
