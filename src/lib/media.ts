const MAX_DIMENSION = 1600;
const THUMB_DIMENSION = 320;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 60;

export type PhotoCapture = {
  original: Blob;
  annotated: Blob;
  thumbnail: Blob;
};

export type VideoCapture = {
  file: Blob;
  thumbnail: Blob;
  durationSeconds: number;
};

function canvasToBlob(canvas: HTMLCanvasElement, type = "image/jpeg", quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("canvas export failed"))), type, quality);
  });
}

function scaledSize(width: number, height: number, maxDim: number) {
  const scale = Math.min(1, maxDim / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// Client-side compression: resize to a sane max dimension and re-encode.
// Matters more than usual here — uploads happen over warehouse wifi from a
// phone in a cold chamber (PLAN.md §6).
export async function loadImageToCanvas(file: File, maxDim = MAX_DIMENSION) {
  const bitmap = await createImageBitmap(file);
  const { width, height } = scaledSize(bitmap.width, bitmap.height, maxDim);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas;
}

export async function buildThumbnail(canvas: HTMLCanvasElement) {
  const { width, height } = scaledSize(canvas.width, canvas.height, THUMB_DIMENSION);
  const thumb = document.createElement("canvas");
  thumb.width = width;
  thumb.height = height;
  thumb.getContext("2d")!.drawImage(canvas, 0, 0, width, height);
  return canvasToBlob(thumb, "image/jpeg", 0.7);
}

export async function extractVideoThumbnail(file: File): Promise<{ thumbnail: Blob; durationSeconds: number }> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("could not read video metadata"));
    });
    video.currentTime = Math.min(0.5, video.duration / 2);
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
    });
    const { width, height } = scaledSize(video.videoWidth, video.videoHeight, THUMB_DIMENSION);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(video, 0, 0, width, height);
    const thumbnail = await canvasToBlob(canvas, "image/jpeg", 0.7);
    return { thumbnail, durationSeconds: video.duration };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// The first argument is kept for call-site compatibility (callers pass their
// client instance) but is unused — the upload + attachments insert now happen
// server-side in /api/attachments, which re-runs the same membership check the
// old RLS policy did.
export async function uploadAttachment(
  _client: unknown,
  opts: {
    warehouseId: string;
    snagId: string;
    updateId?: string | null;
    mediaType: "image" | "video";
    file: Blob;
    original?: Blob;
    thumbnail: Blob;
    fileName: string;
    uploaderId: string;
  }
): Promise<{ error: string | null }> {
  const form = new FormData();
  form.set("warehouseId", opts.warehouseId);
  form.set("snagId", opts.snagId);
  if (opts.updateId) form.set("updateId", opts.updateId);
  form.set("mediaType", opts.mediaType);
  form.set("fileName", opts.fileName);
  form.set("file", opts.file);
  form.set("thumbnail", opts.thumbnail);
  if (opts.original) form.set("original", opts.original);

  try {
    const res = await fetch("/api/attachments", { method: "POST", body: form });
    const json = await res.json().catch(() => ({ error: res.statusText }));
    return { error: json.error ?? null };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
