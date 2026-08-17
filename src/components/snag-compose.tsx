"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { MultiPhotoCaptureInput } from "@/components/photo-capture";
import { MultiVideoCaptureInput } from "@/components/video-capture";
import { createClient } from "@/lib/supabase/client";
import { uploadAttachment, type PhotoCapture, type VideoCapture } from "@/lib/media";
import { postSnagUpdate, closeSnagDirectly, verifySnagClosure } from "@/app/(app)/warehouses/[id]/snag-actions";

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
}: {
  warehouseId: string;
  snagId: string;
  status: string;
  currentUserId: string;
  hasReporterTag: boolean;
  hasResolverTag: boolean;
  isDashboardAdmin: boolean;
}) {
  const isPureAdmin = isDashboardAdmin && !hasReporterTag && !hasResolverTag;
  const isDualReal = hasReporterTag && hasResolverTag;

  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<PhotoCapture[]>([]);
  const [videos, setVideos] = useState<VideoCapture[]>([]);
  const [mediaKey, setMediaKey] = useState(0);
  const [etc, setEtc] = useState("");
  const [nextStatus, setNextStatus] = useState("");
  // For someone tagged both reporter and resolver on this warehouse — which
  // hat they're posting under this message. Not shown at all for a
  // single-role person or a pure (untagged) admin, who each only have one
  // shape of box.
  const [actingAs, setActingAs] = useState<"reporter" | "resolver">(hasReporterTag ? "reporter" : "resolver");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!hasReporterTag && !hasResolverTag && !isDashboardAdmin) return null;

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
    }
    setError(null);
    resetDraft();
  }

  function send() {
    if (!body.trim()) {
      setError("Add a comment before sending.");
      return;
    }
    const as = isPureAdmin ? "resolver" : isDualReal ? actingAs : hasResolverTag ? "resolver" : "reporter";
    startTransition(async () => {
      const result = await postSnagUpdate(
        warehouseId,
        snagId,
        body,
        as,
        as === "resolver" ? etc || null : null,
        as === "resolver" ? nextStatus || null : null
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

  const showResolverControls =
    isPureAdmin || (isDualReal && actingAs === "resolver") || (!isDualReal && !isPureAdmin && hasResolverTag);
  const showReporterControls =
    isPureAdmin || (isDualReal && actingAs === "reporter") || (!isDualReal && !isPureAdmin && hasReporterTag);

  return (
    <div className="rounded-md border border-border bg-background p-2.5">
      {isPureAdmin && (
        <p className="mb-1.5 text-[10px] uppercase tracking-[0.07em] text-faint">Commenting as Dashboard Admin</p>
      )}
      {isDualReal && (
        <div className="mb-1.5 inline-flex rounded-md border border-border p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setActingAs("reporter")}
            className={`rounded px-2 py-0.5 ${actingAs === "reporter" ? "bg-blush text-red-deep" : "text-muted-foreground"}`}
          >
            Commenting as Reporter
          </button>
          <button
            type="button"
            onClick={() => setActingAs("resolver")}
            className={`rounded px-2 py-0.5 ${actingAs === "resolver" ? "bg-frost text-teal-deep" : "text-muted-foreground"}`}
          >
            Commenting as Resolver
          </button>
        </div>
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

      {showResolverControls && (
        <StatusControls etc={etc} setEtc={setEtc} nextStatus={nextStatus} setNextStatus={setNextStatus} />
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={pending || !body.trim()} onClick={send}>
          {pending ? "Sending…" : "Send"}
        </Button>

        {showReporterControls &&
          (status === "ready_to_close" ? (
            <>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => verify(false)}>
                Reject — reopen
              </Button>
              <Button size="sm" disabled={pending} onClick={() => verify(true)}>
                Confirm closed
              </Button>
            </>
          ) : status !== "closed" ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={close}>
              Close ticket
            </Button>
          ) : null)}
      </div>
      {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
