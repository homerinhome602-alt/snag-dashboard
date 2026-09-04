"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MultiPhotoCaptureInput } from "@/components/photo-capture";
import { MultiVideoCaptureInput } from "@/components/video-capture";
import { createClient } from "@/lib/data/client";
import { uploadAttachment, type PhotoCapture, type VideoCapture } from "@/lib/media";
import {
  postSnagUpdate,
  closeSnagDirectly,
  verifySnagClosure,
  reopenSnag,
} from "@/app/(app)/warehouses/[id]/snag-actions";

async function attachDraftMedia(opts: {
  warehouseId: string;
  snagId: string;
  updateId: string;
  currentUserId: string;
  photos: PhotoCapture[];
  videos: VideoCapture[];
}): Promise<{ error: string | null }> {
  const supabase = createClient();
  for (let i = 0; i < opts.photos.length; i++) {
    const r = await uploadAttachment(supabase, {
      warehouseId: opts.warehouseId,
      snagId: opts.snagId,
      updateId: opts.updateId,
      mediaType: "image",
      file: opts.photos[i].annotated,
      original: opts.photos[i].original,
      thumbnail: opts.photos[i].thumbnail,
      fileName: `snag-photo-${i + 1}.jpg`,
      uploaderId: opts.currentUserId,
    });
    if (r.error) return r;
  }
  for (let i = 0; i < opts.videos.length; i++) {
    const r = await uploadAttachment(supabase, {
      warehouseId: opts.warehouseId,
      snagId: opts.snagId,
      updateId: opts.updateId,
      mediaType: "video",
      file: opts.videos[i].file,
      thumbnail: opts.videos[i].thumbnail,
      fileName: `snag-video-${i + 1}.mp4`,
      uploaderId: opts.currentUserId,
    });
    if (r.error) return r;
  }
  return { error: null };
}

// Reporters raise defects, so their compose box gets the "warm" role badge;
// resolvers drive them to close, so theirs gets the "cool" one — the same
// warm=problem / cool=fix thermal thesis the rest of the palette already
// uses, applied to who's speaking rather than what severity something is.
function StatusControls({
  etc,
  setEtc,
  nextStatus,
  setNextStatus,
}: {
  etc: string;
  setEtc: (v: string) => void;
  nextStatus: string;
  setNextStatus: (v: string) => void;
}) {
  return (
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
    </div>
  );
}

export function SnagComposeArea({
  warehouseId,
  snagId,
  status,
  currentUserId,
  hasReporterTag,
  hasResolverTag,
  isDashboardAdmin,
  canManage,
}: {
  warehouseId: string;
  snagId: string;
  status: string;
  currentUserId: string;
  hasReporterTag: boolean;
  hasResolverTag: boolean;
  isDashboardAdmin: boolean;
  canManage: boolean;
}) {
  const isPureAdmin = isDashboardAdmin && !hasReporterTag && !hasResolverTag;
  const router = useRouter();

  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<PhotoCapture[]>([]);
  const [videos, setVideos] = useState<VideoCapture[]>([]);
  const [mediaKey, setMediaKey] = useState(0);
  const [etc, setEtc] = useState("");
  const [nextStatus, setNextStatus] = useState("");
  // Reporter / Resolver no longer gate anything — any tagged member can do
  // every task. The person's own role fixes which side of the chat feed their
  // message sits on (resolver-only → right, everyone else → left); there is no
  // longer a user-facing choice.
  const composeSide: "reporter" | "resolver" =
    hasResolverTag && !hasReporterTag ? "resolver" : "reporter";
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!canManage) return null;

  function resetDraft() {
    setBody("");
    setPhotos([]);
    setVideos([]);
    setEtc("");
    setNextStatus("");
    setMediaKey((k) => k + 1);
  }

  async function afterAction(result: { updateId: string | null; error: string | null }) {
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.updateId && (photos.length > 0 || videos.length > 0)) {
      const r = await attachDraftMedia({ warehouseId, snagId, updateId: result.updateId, currentUserId, photos, videos });
      if (r.error) {
        setError(`Posted, but an attachment failed to upload: ${r.error}`);
        return;
      }
      // The attachment upload happens client-side after postSnagUpdate's own
      // revalidatePath already ran, so without this the new photos/videos
      // wouldn't show up in the feed until some later, unrelated refresh —
      // the text bubble would appear immediately but its attachments
      // wouldn't, even for the person who just sent them.
      router.refresh();
    }
    setError(null);
    resetDraft();
  }

  function send() {
    if (!body.trim()) {
      setError("Add a comment before sending.");
      return;
    }
    // p_acting_as only sets the chat side; the RPC accepts ETC/status from any
    // member regardless. A pure admin's author_side is forced to 'admin' by the
    // RPC anyway.
    startTransition(async () => {
      const result = await postSnagUpdate(
        warehouseId,
        snagId,
        body,
        composeSide,
        etc || null,
        nextStatus || null
      );
      await afterAction(result);
    });
  }

  function close() {
    startTransition(async () => {
      const result = await closeSnagDirectly(warehouseId, snagId, body || null);
      await afterAction(result);
    });
  }

  function verify(approved: boolean) {
    startTransition(async () => {
      const result = await verifySnagClosure(warehouseId, snagId, approved, body || null);
      await afterAction(result);
    });
  }

  function reopen() {
    startTransition(async () => {
      const result = await reopenSnag(warehouseId, snagId, body || null);
      await afterAction(result);
    });
  }

  // A closed snag only offers one action: reopen it (with an optional note).
  if (status === "closed") {
    return (
      <div className="rounded-md border border-border bg-background p-2.5">
        <p className="mb-1.5 text-[11px] text-muted-foreground">
          This snag is closed. Reopen it to add updates or change its status.
        </p>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Why are you reopening this? (optional)"
          className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-[12.5px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <div className="mt-1.5">
          <Button size="sm" variant="outline" disabled={pending} onClick={reopen}>
            {pending ? "Reopening…" : "Reopen snag"}
          </Button>
        </div>
        {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-background p-2.5">
      {isPureAdmin && (
        <p className="mb-1.5 text-[10px] uppercase tracking-[0.07em] text-faint">Commenting as Dashboard Admin</p>
      )}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Add a comment"
        className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-[12.5px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />

      <div key={mediaKey} className="mt-1.5 flex flex-col gap-1.5 sm:flex-row">
        <div className="flex-1">
          <MultiPhotoCaptureInput onChange={setPhotos} />
        </div>
        <div className="flex-1">
          <MultiVideoCaptureInput onChange={setVideos} />
        </div>
      </div>

      <StatusControls etc={etc} setEtc={setEtc} nextStatus={nextStatus} setNextStatus={setNextStatus} />

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={pending || !body.trim()} onClick={send}>
          {pending ? "Sending…" : "Send"}
        </Button>

        {status === "ready_to_close" ? (
          <>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => verify(false)}>
              Reject — reopen
            </Button>
            <Button size="sm" disabled={pending} onClick={() => verify(true)}>
              Confirm closed
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" disabled={pending} onClick={close}>
            Close ticket
          </Button>
        )}
      </div>
      {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
