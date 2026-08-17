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
