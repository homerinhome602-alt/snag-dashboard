"use client";

import { useEffect, useRef, useState } from "react";
import { buildThumbnail, loadImageToCanvas, type PhotoCapture } from "@/lib/media";

// Canvas overlay for circling the defect before save, per PLAN.md §6.
// The original (pristine) image is always preserved separately from the
// annotated version.
export function PhotoCaptureInput({ onChange }: { onChange: (capture: PhotoCapture | null) => void }) {
  const pristineRef = useRef<HTMLCanvasElement | null>(null);
  const visibleRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef<{ x: number; y: number } | null>(null);
  const [hasImage, setHasImage] = useState(false);
  const [hasAnnotation, setHasAnnotation] = useState(false);
  const [busy, setBusy] = useState(false);

  // The <canvas> only mounts once hasImage flips true, so the first
  // draw has to happen in an effect (after commit), not inline in the
  // file-select handler where the ref is still null.
  useEffect(() => {
    if (hasImage) {
      redraw();
      emit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasImage]);

  async function onFileSelected(file: File) {
    setBusy(true);
    try {
      const canvas = await loadImageToCanvas(file);
      pristineRef.current = canvas;
      setHasAnnotation(false);
      setHasImage(true);
    } finally {
      setBusy(false);
    }
  }

  function redraw() {
    const pristine = pristineRef.current;
    const visible = visibleRef.current;
    if (!pristine || !visible) return;
    visible.width = pristine.width;
    visible.height = pristine.height;
    visible.getContext("2d")!.drawImage(pristine, 0, 0);
  }

  function drawCircle(x0: number, y0: number, x1: number, y1: number) {
    redraw();
    const ctx = visibleRef.current!.getContext("2d")!;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const rx = Math.abs(x1 - x0) / 2;
    const ry = Math.abs(y1 - y0) / 2;
    ctx.strokeStyle = "#C75B4E";
    ctx.lineWidth = Math.max(3, visibleRef.current!.width / 200);
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(rx, 4), Math.max(ry, 4), 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  function toCanvasCoords(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = visibleRef.current!.getBoundingClientRect();
    const scaleX = visibleRef.current!.width / rect.width;
    const scaleY = visibleRef.current!.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  async function emit() {
    const pristine = pristineRef.current;
    const visible = visibleRef.current;
    if (!pristine || !visible) {
      onChange(null);
      return;
    }
    const [original, annotated, thumbnail] = await Promise.all([
      new Promise<Blob>((res, rej) => pristine.toBlob((b) => (b ? res(b) : rej()), "image/jpeg", 0.85)),
      new Promise<Blob>((res, rej) => visible.toBlob((b) => (b ? res(b) : rej()), "image/jpeg", 0.85)),
      buildThumbnail(visible),
    ]);
    onChange({ original, annotated, thumbnail });
  }

  return (
    <div>
      {!hasImage ? (
        <label className="flex h-14 cursor-pointer items-center justify-center rounded-md border border-dashed border-input text-[13px] text-muted-foreground hover:bg-muted">
          {busy ? "Loading…" : "Take or add a photo"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFileSelected(e.target.files[0])}
          />
        </label>
      ) : (
        <div>
          <canvas
            ref={visibleRef}
            className="w-full cursor-crosshair rounded-md border border-border"
            onMouseDown={(e) => {
              draggingRef.current = toCanvasCoords(e);
            }}
            onMouseMove={(e) => {
              if (!draggingRef.current) return;
              const { x, y } = toCanvasCoords(e);
              drawCircle(draggingRef.current.x, draggingRef.current.y, x, y);
            }}
            onMouseUp={async () => {
              if (draggingRef.current) {
                setHasAnnotation(true);
                await emit();
              }
              draggingRef.current = null;
            }}
          />
          <div className="mt-1.5 flex items-center gap-2 text-[11.5px]">
            <span className="text-muted-foreground">Drag on the photo to circle the defect.</span>
            {hasAnnotation && (
              <button
                type="button"
                className="text-primary"
                onClick={async () => {
                  redraw();
                  setHasAnnotation(false);
                  await emit();
                }}
              >
                Clear circle
              </button>
            )}
            <button
              type="button"
              className="ml-auto text-destructive"
              onClick={() => {
                pristineRef.current = null;
                setHasImage(false);
                setHasAnnotation(false);
                onChange(null);
              }}
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
