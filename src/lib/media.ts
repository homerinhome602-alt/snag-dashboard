import type { SupabaseClient } from "@supabase/supabase-js";

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

function randomId() {
  return crypto.randomUUID().slice(0, 8);
}

export async function uploadAttachment(
  supabase: SupabaseClient,
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
  const base = `${opts.warehouseId}/${opts.snagId}/${randomId()}`;
  const ext = opts.mediaType === "image" ? "jpg" : "mp4";

  const uploads: Promise<{ error: Error | null }>[] = [
    supabase.storage.from("attachments").upload(`${base}.${ext}`, opts.file, {
      contentType: opts.mediaType === "image" ? "image/jpeg" : "video/mp4",
    }),
    supabase.storage.from("attachments").upload(`${base}-thumb.jpg`, opts.thumbnail, {
      contentType: "image/jpeg",
    }),
  ];
  if (opts.original) {
    uploads.push(
      supabase.storage.from("attachments").upload(`${base}-original.jpg`, opts.original, {
        contentType: "image/jpeg",
      })
    );
  }

  const results = await Promise.all(uploads);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return { error: failed.error.message };
  }

  const { error } = await supabase.from("attachments").insert({
    snag_id: opts.snagId,
    update_id: opts.updateId ?? null,
    media_type: opts.mediaType,
    file_url: `${base}.${ext}`,
    original_url: opts.original ? `${base}-original.jpg` : null,
    thumbnail_url: `${base}-thumb.jpg`,
    file_name: opts.fileName,
    uploaded_by: opts.uploaderId,
  });

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}
