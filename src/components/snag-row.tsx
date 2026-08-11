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
import { closeSnagDirectly, postSnagUpdate, verifySnagClosure } from "@/app/(app)/warehouses/[id]/snag-actions";
import type { SnagRow as SnagRowData } from "@/components/snag-table";
import { VideoCaptureInput } from "@/components/video-capture";
import { createClient } from "@/lib/supabase/client";
import { uploadAttachment, type VideoCapture } from "@/lib/media";
import { cn } from "@/lib/utils";
import { STICKY_SNO_CLASS, STICKY_DATE_CLASS, STICKY_DESC_CLASS } from "@/lib/table-sticky";

export type UpdateRow = {
  id: string;
  body: string;
  created_at: string;
  author: { full_name: string | null; email: string } | null;
};

export type AttachmentRow = {
  id: string;
  update_id: string | null;
  media_type: string;
  thumbnail_url: string;
  file_url: string;
};

export type ActivityRow = {
  id: string;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  actor: { full_name: string | null; email: string } | null;
};

function describeActivity(a: ActivityRow): string {
  switch (a.action) {
    case "raise":
      return "raised this snag";
    case "status_change":
      return `moved status from ${STATUS_LABELS[a.old_value ?? ""] ?? a.old_value ?? "—"} to ${
        STATUS_LABELS[a.new_value ?? ""] ?? a.new_value ?? "—"
      }`;
    case "etc_update":
      return a.old_value
        ? `updated ETC from ${fmtDate(a.old_value)} to ${a.new_value ? fmtDate(a.new_value) : "—"}`
        : `set ETC to ${a.new_value ? fmtDate(a.new_value) : "—"}`;
    case "verify_closure":
      return "closed this snag";
    case "reject_closure":
      return "reopened this snag";
    case "duplicate_suppressed":
      return "raised this snag despite a possible duplicate match";
    default:
      return a.action.replaceAll("_", " ");
  }
}

function AttachmentThumbs({ attachments }: { attachments: AttachmentRow[] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {attachments.map((a) => (
        <a
          key={a.id}
          href={a.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="relative block h-14 w-14 overflow-hidden rounded-md border border-border"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.thumbnail_url} alt="" className="h-full w-full object-cover" />
          {a.media_type === "video" && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-[16px] text-white">
              ▶
            </span>
          )}
        </a>
      ))}
    </div>
  );
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function UpdateForm({
  warehouseId,
  snagId,
  currentUserId,
}: {
  warehouseId: string;
  snagId: string;
  currentUserId: string;
}) {
  const [body, setBody] = useState("");
  const [etc, setEtc] = useState("");
  const [nextStatus, setNextStatus] = useState("");
  const [video, setVideo] = useState<VideoCapture | null>(null);
  const [videoInputKey, setVideoInputKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-md border border-border bg-background p-2.5">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Type here"
        className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-[12.5px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <div className="mt-1.5 w-56">
        <VideoCaptureInput key={videoInputKey} onChange={setVideo} />
      </div>
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
          <option value="ready_to_close">Ticket closed, verify</option>
        </select>
        <Button
          size="sm"
          disabled={pending || !body.trim()}
          onClick={() =>
            startTransition(async () => {
              const result = await postSnagUpdate(warehouseId, snagId, body, etc || null, nextStatus || null);
              if (result.error || !result.updateId) {
                setError(result.error ?? "Could not post the update.");
                return;
              }
              if (video) {
                const supabase = createClient();
                const uploadResult = await uploadAttachment(supabase, {
                  warehouseId,
                  snagId,
                  updateId: result.updateId,
                  mediaType: "video",
                  file: video.file,
                  thumbnail: video.thumbnail,
                  fileName: "snag-video.mp4",
                  uploaderId: currentUserId,
                });
                if (uploadResult.error) {
                  setError(`Update posted, but the video failed to upload: ${uploadResult.error}`);
                  return;
                }
              }
              setError(null);
              setBody("");
              setEtc("");
              setNextStatus("");
              setVideo(null);
              setVideoInputKey((k) => k + 1);
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

function DirectCloseAction({ warehouseId, snagId }: { warehouseId: string; snagId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await closeSnagDirectly(warehouseId, snagId);
            if (r.error) setError(r.error);
          })
        }
      >
        {pending ? "Closing…" : "Close snag"}
      </Button>
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
  attachments,
  activity,
  warehouseId,
  isReporter,
  isResolver,
  currentUserId,
}: {
  snag: SnagRowData;
  updates: UpdateRow[];
  attachments: AttachmentRow[];
  activity: ActivityRow[];
  warehouseId: string;
  isReporter: boolean;
  isResolver: boolean;
  currentUserId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const snagPhotos = attachments.filter((a) => a.update_id === null);
  const attachmentsByUpdate = new Map<string, AttachmentRow[]>();
  for (const a of attachments) {
    if (a.update_id) attachmentsByUpdate.set(a.update_id, [...(attachmentsByUpdate.get(a.update_id) ?? []), a]);
  }
  const days = ageingDays(s.date_raised, s.closed_at);
  const overdue = isOverdue(s.etc_date, s.status);
  const subCategory =
    s.sub_category === "others" && s.sub_category_other
      ? s.sub_category_other
      : SUB_CATEGORY_LABELS[s.sub_category] ?? s.sub_category;
  const latest = updates[updates.length - 1];

  // Expanding scrolls the table back to the frozen columns — a colSpan
  // cell can't itself stay sticky while the row is scrolled right (that's
  // a real position:sticky limitation on spanning table cells), so the
  // expanded content would otherwise open off-screen to the left.
  function toggleExpanded(e: React.MouseEvent<HTMLTableRowElement>) {
    const container = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-slot="table-container"]');
    setExpanded((v) => {
      const next = !v;
      if (next && container) container.scrollLeft = 0;
      return next;
    });
  }

  return (
    <>
      <TableRow className="group cursor-pointer" onClick={toggleExpanded}>
        <TableCell className={cn(STICKY_SNO_CLASS, "font-mono text-[11px] text-muted-foreground")}>
          {String(s.serial_no).padStart(3, "0")}
        </TableCell>
        <TableCell className={cn(STICKY_DATE_CLASS, "whitespace-nowrap font-mono text-[11px] text-muted-foreground")}>
          {fmtDate(s.date_raised)}
        </TableCell>
        <TableCell className={cn(STICKY_DESC_CLASS, "text-[12.5px] text-foreground")}>
          {s.description}
        </TableCell>
        <TableCell className="whitespace-nowrap text-[12px]">
          {s.raised_by_profile?.full_name ?? s.raised_by_profile?.email ?? "—"}
        </TableCell>
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
          <TableCell colSpan={13} className="bg-card">
            <div className="flex flex-col gap-2 py-1" onClick={(e) => e.stopPropagation()}>
              {snagPhotos.length > 0 || updates.length > 0 ? (
                <div className="ml-2 flex flex-col gap-3 pl-1">
                  {snagPhotos.length > 0 && (
                    <div className="relative pl-4 text-[12px]">
                      <span className="absolute top-1.5 left-0 h-2 w-2 rounded-full bg-primary ring-4 ring-background" />
                      {updates.length > 0 && (
                        <span className="absolute top-3.5 bottom-[-18px] left-[3.5px] w-px bg-border" />
                      )}
                      <span className="rounded-chip bg-sky px-1.5 py-0.5 text-[10px] font-medium text-teal-deep">
                        Description
                      </span>{" "}
                      <span className="text-foreground">{s.description}</span>
                      <div className="mt-1">
                        <AttachmentThumbs attachments={snagPhotos} />
                      </div>
                    </div>
                  )}
                  {updates.map((u, i) => (
                    <div key={u.id} className="relative pl-4 text-[12px]">
                      <span className="absolute top-1.5 left-0 h-2 w-2 rounded-full bg-primary ring-4 ring-background" />
                      {i < updates.length - 1 && (
                        <span className="absolute top-3.5 bottom-[-18px] left-[3.5px] w-px bg-border" />
                      )}
                      <span className="text-foreground">{u.body}</span>{" "}
                      <span className="font-mono text-[10px] text-faint">
                        · {u.author?.full_name ?? u.author?.email ?? "—"} ·{" "}
                        {new Date(u.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                      </span>
                      {attachmentsByUpdate.has(u.id) && (
                        <div className="mt-1">
                          <AttachmentThumbs attachments={attachmentsByUpdate.get(u.id)!} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-muted-foreground">No updates yet.</p>
              )}
              {isResolver && (
                <UpdateForm warehouseId={warehouseId} snagId={s.id} currentUserId={currentUserId} />
              )}
              {isReporter && s.status === "ready_to_close" && (
                <VerifyActions warehouseId={warehouseId} snagId={s.id} />
              )}
              {isReporter && s.status !== "closed" && s.status !== "ready_to_close" && (
                <DirectCloseAction warehouseId={warehouseId} snagId={s.id} />
              )}
              {activity.length > 0 && (
                <div className="border-t border-line-soft pt-2">
                  <button
                    type="button"
                    onClick={() => setShowHistory((v) => !v)}
                    className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                  >
                    {showHistory ? "Hide history" : `View history (${activity.length})`}
                  </button>
                  {showHistory && (
                    <ul className="mt-1.5 flex flex-col gap-1 border-l border-border pl-2.5">
                      {activity.map((a) => (
                        <li key={a.id} className="text-[11px] text-muted-foreground">
                          <span className="text-foreground">{a.actor?.full_name ?? a.actor?.email ?? "Someone"}</span>{" "}
                          {describeActivity(a)}
                          <span className="font-mono text-[10px] text-faint">
                            {" "}
                            ·{" "}
                            {new Date(a.created_at).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                            })}{" "}
                            {new Date(a.created_at).toLocaleTimeString("en-GB", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
