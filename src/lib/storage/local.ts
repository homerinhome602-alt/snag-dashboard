import { createHmac } from "crypto";
import { promises as fs } from "fs";
import path from "path";

// Filesystem stand-in for the private Supabase Storage bucket. Files live under
// STORAGE_DIR/<bucket>/<key>; reads go through a short-lived HMAC-signed URL
// (createSignedUrl) served by /api/attachments/[...path].

const ROOT = process.env.STORAGE_DIR ?? path.join(process.cwd(), ".storage");

export const BUCKET = "attachments";
export const MAX_BYTES = 52_428_800; // 50 MB — matched to the live bucket
export const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

// Handover documents — wider set (PDF / Office / images).
export const ALLOWED_DOC_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
]);

function safeKey(key: string): string {
  const norm = path.posix.normalize(key);
  if (norm.startsWith("..") || path.isAbsolute(norm)) throw new Error("invalid object key");
  return norm;
}

function diskPath(bucket: string, key: string): string {
  return path.join(ROOT, bucket, safeKey(key));
}

export async function putObject(
  bucket: string,
  key: string,
  bytes: Buffer,
  contentType: string
): Promise<void> {
  const p = diskPath(bucket, key);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, bytes);
  // keep a metadata sidecar so content-type survives a round-trip
  await fs.writeFile(p + ".meta.json", JSON.stringify({ contentType, size: bytes.length }));
}

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

export async function readObject(
  bucket: string,
  key: string
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const p = diskPath(bucket, key);
  try {
    const bytes = await fs.readFile(p);
    const ext = key.split(".").pop()?.toLowerCase() ?? "";
    let contentType = EXT_MIME[ext] ?? "application/octet-stream";
    try {
      contentType =
        JSON.parse(await fs.readFile(p + ".meta.json", "utf8")).contentType ?? contentType;
    } catch {
      /* no sidecar — extension inference above is used */
    }
    return { bytes, contentType };
  } catch {
    return null;
  }
}

// ---- signed URLs -------------------------------------------------------

function sig(key: string, exp: number): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return createHmac("sha256", s).update(`${key}:${exp}`).digest("hex");
}

export function createSignedPath(key: string, expiresInSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const k = safeKey(key);
  return `/api/attachments/${k.split("/").map(encodeURIComponent).join("/")}?exp=${exp}&sig=${sig(k, exp)}`;
}

export function verifySignedRequest(key: string, exp: string | null, providedSig: string | null): boolean {
  if (!exp || !providedSig) return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum * 1000 < Date.now()) return false;
  try {
    return sig(safeKey(key), expNum) === providedSig;
  } catch {
    return false;
  }
}
