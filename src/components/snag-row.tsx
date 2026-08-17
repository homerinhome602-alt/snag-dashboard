"use client";

import { useEffect, useRef, useState } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
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
import type { SnagRow as SnagRowData } from "@/components/snag-table";
import { SnagComposeArea } from "@/components/snag-compose";
import { cn } from "@/lib/utils";
import { STICKY_SNO_CLASS, STICKY_DATE_CLASS, STICKY_DESC_CLASS } from "@/lib/table-sticky";

export type UpdateRow = {
  id: string;
  body: string;
  author_id: string;
  author_side: "reporter" | "resolver" | "admin";
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
    case "correct_date_raised":
      return `corrected the raised date from ${a.old_value ? fmtDate(a.old_value) : "—"} to ${
        a.new_value ? fmtDate(a.new_value) : "—"
      }`;
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

// Time before date, per feedback — "14:57 · 12 Aug" reads as a log entry
// timestamp, matching how the format is used elsewhere in the feed.
function fmtTimeDate(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  return `${time} · ${date}`;
}

const SIDE_LABEL: Record<string, string> = {
  reporter: "Reporter",
  resolver: "Resolver",
  admin: "Dashboard Admin",
};

// A message shows the author's actual current operational role(s) on this
// warehouse (e.g. "HVAC Engineer") when they're tagged with one — real role
// always wins over any bucket label, since the bucket is about which side
// of the thread a message sits on, not a description of the person. Next,
// "Dashboard Admin" if they hold no tag here but are a real admin (this
// matters most for the raise bubble, which always sits on the reporter
// side even when an admin bypassed to raise it — the badge should still
// say what they actually are). The generic reporter/resolver bucket is
// only a last resort, for someone with neither a current tag nor admin
// status (e.g. fully removed from the org, message kept for the record).
function roleTextFor(
  side: "reporter" | "resolver" | "admin",
  authorId: string,
  rolesByUserId: Record<string, string[]>,
  adminUserIds: string[]
) {
  const roles = rolesByUserId[authorId];
  if (roles && roles.length > 0) return roles.join(", ");
  if (adminUserIds.includes(authorId)) return "Dashboard Admin";
  return SIDE_LABEL[side];
}

// Reporters raise defects (the problem), resolvers drive them to close (the
// fix) — reusing the palette's own warm/cool thermal thesis for who's
// speaking, not just severity, keeps the two sides visually distinct
// without introducing a new accent. The message box itself carries the same
// tint now, not just the name badge.
const SIDE_BADGE_CLASS: Record<string, string> = {
  reporter: "bg-blush text-red-deep",
  resolver: "bg-frost text-teal-deep",
  admin: "bg-line-soft text-foreground",
};

const SIDE_BOX_CLASS: Record<string, string> = {
  reporter: "border-blush bg-blush",
  resolver: "border-frost bg-frost",
  admin: "border-line-soft bg-line-soft",
};

const SIDE_JUSTIFY_CLASS: Record<string, string> = {
  reporter: "justify-start",
  resolver: "justify-end",
  admin: "justify-center",
};

const SIDE_ITEMS_CLASS: Record<string, string> = {
  reporter: "items-start",
  resolver: "items-end",
  admin: "items-center",
};

function ChatBubble({
  side,
  authorName,
  roleText,
  body,
  attachments,
  timestamp,
}: {
  side: "reporter" | "resolver" | "admin";
  authorName: string;
  roleText: string;
  body: string;
  attachments: AttachmentRow[];
  timestamp: string;
}) {
  // A row wrapper positions the bubble via justify-content, with the bubble
  // itself sized to its content (capped at 85%) as a flex-row child — a
  // max-w column div with mx-auto/mr-auto looked right for reporter/resolver
  // by coincidence (they hug an edge either way) but silently mis-centered
  // admin's bubble, since a flex-col item stretches to fill the cross axis
  // by default and auto-margins had no slack left to distribute.
  return (
    <div className={cn("flex", SIDE_JUSTIFY_CLASS[side])}>
      <div className={cn("flex max-w-[85%] flex-col gap-0.5", SIDE_ITEMS_CLASS[side])}>
        <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
          <span className="font-mono text-faint">{timestamp}</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-medium text-foreground">{authorName}</span>
          <span className={cn("rounded-chip px-1.5 py-0.5 text-[9px] font-medium", SIDE_BADGE_CLASS[side])}>
            {roleText}
          </span>
        </div>
        <div
          className={cn(
            "whitespace-normal rounded-md border px-2.5 py-1.5 text-[12px] text-foreground",
            SIDE_BOX_CLASS[side]
          )}
        >
          {body}
          {attachments.length > 0 && (
            <div className="mt-1.5">
              <AttachmentThumbs attachments={attachments} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SystemLine({ actorName, text, timestamp }: { actorName: string; text: string; timestamp: string }) {
  return (
    <div className="text-center text-[10.5px] text-muted-foreground">
      <span className="font-mono text-faint">{timestamp}</span> · {actorName} {text}
    </div>
  );
}

type FeedItem =
  | {
      kind: "message";
      id: string;
      side: "reporter" | "resolver" | "admin";
      authorName: string;
      roleText: string;
      body: string;
      attachments: AttachmentRow[];
      createdAt: string;
    }
  | { kind: "system"; id: string; actorName: string; text: string; createdAt: string };

function buildFeed(
  s: SnagRowData,
  updates: UpdateRow[],
  snagPhotos: AttachmentRow[],
  attachmentsByUpdate: Map<string, AttachmentRow[]>,
  activity: ActivityRow[],
  rolesByUserId: Record<string, string[]>,
  adminUserIds: string[]
): FeedItem[] {
  const items: FeedItem[] = [];

  // The raise itself is always the thread's opening message — it always
  // comes from the reporter side, even when a Dashboard Admin bypassing
  // without a reporter tag is the one who clicked it.
  const raiseActivity = activity.find((a) => a.action === "raise");
  items.push({
    kind: "message",
    id: `raise-${s.id}`,
    side: "reporter",
    authorName: s.raised_by_profile?.full_name ?? s.raised_by_profile?.email ?? "Someone",
    roleText: roleTextFor("reporter", s.raised_by, rolesByUserId, adminUserIds),
    body: s.description,
    attachments: snagPhotos,
    createdAt: raiseActivity?.created_at ?? `${s.date_raised}T00:00:00`,
  });

  for (const u of updates) {
    items.push({
      kind: "message",
      id: u.id,
      side: u.author_side,
      authorName: u.author?.full_name ?? u.author?.email ?? "Someone",
      roleText: roleTextFor(u.author_side, u.author_id, rolesByUserId, adminUserIds),
      body: u.body,
      attachments: attachmentsByUpdate.get(u.id) ?? [],
      createdAt: u.created_at,
    });
  }

  for (const a of activity) {
    if (a.action === "raise") continue;
    items.push({
      kind: "system",
      id: a.id,
      actorName: a.actor?.full_name ?? a.actor?.email ?? "Someone",
      text: describeActivity(a),
      createdAt: a.created_at,
    });
  }

  items.sort((x, y) => new Date(x.createdAt).getTime() - new Date(y.createdAt).getTime());
  return items;
}

export function SnagRow({
  snag: s,
  updates,
  attachments,
  activity,
  warehouseId,
  hasReporterTag,
  hasResolverTag,
  isDashboardAdmin,
  rolesByUserId,
  adminUserIds,
  currentUserId,
}: {
  snag: SnagRowData;
  updates: UpdateRow[];
  attachments: AttachmentRow[];
  activity: ActivityRow[];
  warehouseId: string;
  hasReporterTag: boolean;
  hasResolverTag: boolean;
  isDashboardAdmin: boolean;
  rolesByUserId: Record<string, string[]>;
  adminUserIds: string[];
  currentUserId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  // Measures the table's own scroll container so the panel below can match
  // its exact visible width — confined to the screen and dynamic across
  // breakpoints/sidebar-collapse, not a guessed fixed pixel cap.
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState<number | null>(null);
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

  // Expanding scrolls the table back to the frozen columns so the panel
  // opens on screen — the panel itself then stays put via position:sticky
  // (see the wrapper below) however far the table gets scrolled after that.
  function toggleExpanded(e: React.MouseEvent<HTMLTableRowElement>) {
    const container = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-slot="table-container"]');
    setExpanded((v) => {
      const next = !v;
      if (next && container) container.scrollLeft = 0;
      return next;
    });
  }

  // container.clientWidth is the scroll container's *visible* width — it
  // already accounts for the sidebar's current state, page padding, and the
  // viewport size, so tracking it (via ResizeObserver, for window resizes
  // and sidebar expand/collapse alike) gives the panel the exact width of
  // the screen area actually available, not an approximation of it.
  useEffect(() => {
    if (!expanded) return;
    const container = panelRef.current?.closest<HTMLElement>('[data-slot="table-container"]');
    if (!container) return;
    const update = () => setPanelWidth(container.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [expanded]);

  const feed = buildFeed(s, updates, snagPhotos, attachmentsByUpdate, activity, rolesByUserId, adminUserIds);

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
        <TableCell className="text-center">
          <span className={`rounded-chip px-1.5 py-0.5 text-[10px] font-medium ${SEVERITY_CHIP[s.severity]}`}>
            {SEVERITY_LABELS[s.severity] ?? s.severity}
          </span>
        </TableCell>
        <TableCell className="text-center">
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
          <TableCell colSpan={13} className="bg-background p-0">
            {/* Sticks to the left edge of the table's own scroll container
                as it's scrolled horizontally — a colSpan cell can't itself
                be sticky (position:sticky doesn't work on a cell spanning
                the full row width), but a plain block inside a wide cell
                can. Width is measured off that same container (see the
                ResizeObserver above) so the panel always matches the
                actually-visible screen area instead of a guessed cap. */}
            <div
              ref={panelRef}
              className="sticky left-0 z-10 flex w-[90vw] flex-col gap-2.5 border-x-2 border-border bg-background px-3 py-3 shadow-[inset_0_1px_0_0_var(--card)]"
              style={panelWidth ? { width: panelWidth } : undefined}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[9px] font-medium uppercase tracking-[0.07em] text-faint">
                Snag #{s.serial_no} — updates
              </p>
              {feed.map((item) =>
                item.kind === "message" ? (
                  <ChatBubble
                    key={item.id}
                    side={item.side}
                    authorName={item.authorName}
                    roleText={item.roleText}
                    body={item.body}
                    attachments={item.attachments}
                    timestamp={fmtTimeDate(item.createdAt)}
                  />
                ) : (
                  <SystemLine
                    key={item.id}
                    actorName={item.actorName}
                    text={item.text}
                    timestamp={fmtTimeDate(item.createdAt)}
                  />
                )
              )}
              {s.status !== "closed" && (
                <SnagComposeArea
                  warehouseId={warehouseId}
                  snagId={s.id}
                  status={s.status}
                  currentUserId={currentUserId}
                  hasReporterTag={hasReporterTag}
                  hasResolverTag={hasResolverTag}
                  isDashboardAdmin={isDashboardAdmin}
                />
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
