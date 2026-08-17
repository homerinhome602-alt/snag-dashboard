"use client";

import { useState } from "react";
import {
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  extractVideoThumbnail,
  type VideoCapture,
} from "@/lib/media";

// Hard size/duration cap enforced client-side before upload begins,
// per PLAN.md §6.
export function VideoCaptureInput({ onChange }: { onChange: (capture: VideoCapture | null) => void }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFileSelected(file: File) {
    setError(null);
    if (file.size > MAX_VIDEO_BYTES) {
      setError(`Video is too large (max ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)}MB).`);
      return;
    }
    setBusy(true);
    try {
      const { thumbnail, durationSeconds } = await extractVideoThumbnail(file);
      if (durationSeconds > MAX_VIDEO_SECONDS) {
        setError(`Video is too long (max ${MAX_VIDEO_SECONDS}s, this is ${Math.round(durationSeconds)}s).`);
        return;
      }
      setFileName(file.name);
      onChange({ file, thumbnail, durationSeconds });
    } catch {
      setError("Could not read that video file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {!fileName ? (
        <label className="flex h-14 cursor-pointer items-center justify-center rounded-md border border-dashed border-input text-[13px] text-muted-foreground hover:bg-muted">
          {busy ? "Checking…" : "Attach a video"}
          <input
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFileSelected(e.target.files[0])}
          />
        </label>
      ) : (
        <div className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-[12px]">
          <span className="truncate text-foreground">{fileName}</span>
          <button
            type="button"
            className="ml-2 shrink-0 text-destructive"
            onClick={() => {
              setFileName(null);
              onChange(null);
            }}
          >
            Remove
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

// Wraps the single-shot picker above to build a list, mirroring
// MultiPhotoCaptureInput's draft-then-commit pattern (see there for why —
// video doesn't need it for the same reason since there's no re-editing
// loop, but the two stay symmetric so multi-attach behaves the same way
// for both media types).
export function MultiVideoCaptureInput({ onChange }: { onChange: (captures: VideoCapture[]) => void }) {
  const [captures, setCaptures] = useState<VideoCapture[]>([]);
  const [draft, setDraft] = useState<VideoCapture | null>(null);
  const [pickerKey, setPickerKey] = useState(0);

  function addDraft() {
    if (!draft) return;
    const next = [...captures, draft];
    setCaptures(next);
    onChange(next);
    setDraft(null);
    setPickerKey((k) => k + 1);
  }

  function removeCapture(index: number) {
    const next = captures.filter((_, i) => i !== index);
    setCaptures(next);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {captures.length > 0 && (
        <div className="flex flex-col gap-1">
          {captures.map((c, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-[12px]"
            >
              <span className="text-foreground">{Math.round(c.durationSeconds)}s video</span>
              <button type="button" className="text-destructive" onClick={() => removeCapture(i)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <VideoCaptureInput key={pickerKey} onChange={setDraft} />
      {draft && (
        <button
          type="button"
          onClick={addDraft}
          className="self-start text-[11.5px] font-medium text-primary hover:underline"
        >
          + Add this video
        </button>
      )}
    </div>
  );
}
