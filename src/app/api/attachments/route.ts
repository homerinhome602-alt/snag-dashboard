import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { readSession } from "@/lib/auth/session";
import { withUser, withServiceRole } from "@/lib/db/scope";
import { QueryBuilder } from "@/lib/pgrest/builder";
import { putObject, BUCKET, MAX_BYTES, ALLOWED_MIME } from "@/lib/storage/local";

// Replaces the client-side supabase.storage.upload + attachments insert.
// Same authorization the old RLS enforced: the attachments INSERT policy
// (reporter/resolver/admin on the snag's warehouse) still runs, because the
// insert goes through withUser().
export async function POST(request: Request) {
  const claims = await readSession();
  if (!claims) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const form = await request.formData();
  const warehouseId = String(form.get("warehouseId") ?? "");
  const snagId = String(form.get("snagId") ?? "");
  const updateId = form.get("updateId") ? String(form.get("updateId")) : null;
  const mediaType = String(form.get("mediaType") ?? "");
  const fileName = String(form.get("fileName") ?? "");
  const file = form.get("file");
  const thumbnail = form.get("thumbnail");
  const original = form.get("original");

  if (!warehouseId || !snagId || (mediaType !== "image" && mediaType !== "video")) {
    return NextResponse.json({ error: "missing or invalid fields" }, { status: 400 });
  }
  if (!(file instanceof Blob) || !(thumbnail instanceof Blob)) {
    return NextResponse.json({ error: "file and thumbnail are required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file exceeds 50 MB limit" }, { status: 413 });
  }
  const contentType = mediaType === "image" ? "image/jpeg" : "video/mp4";
  if (!ALLOWED_MIME.has(file.type || contentType)) {
    return NextResponse.json({ error: `unsupported media type: ${file.type}` }, { status: 415 });
  }

  const base = `${warehouseId}/${snagId}/${randomUUID().slice(0, 8)}`;
  const ext = mediaType === "image" ? "jpg" : "mp4";
  const fileKey = `${base}.${ext}`;
  const thumbKey = `${base}-thumb.jpg`;
  const originalKey = original instanceof Blob ? `${base}-original.jpg` : null;

  try {
    await putObject(BUCKET, fileKey, Buffer.from(await file.arrayBuffer()), contentType);
    await putObject(BUCKET, thumbKey, Buffer.from(await thumbnail.arrayBuffer()), "image/jpeg");
    if (original instanceof Blob && originalKey) {
      await putObject(BUCKET, originalKey, Buffer.from(await original.arrayBuffer()), "image/jpeg");
    }
  } catch (e) {
    return NextResponse.json({ error: `storage write failed: ${(e as Error).message}` }, { status: 500 });
  }

  // keep storage.objects consistent with migrated rows (metadata only)
  await withServiceRole(async (c) => {
    for (const key of [fileKey, thumbKey, originalKey].filter(Boolean) as string[]) {
      await c.query(
        `insert into storage.objects (bucket_id, name, owner, metadata)
         values ($1, $2, $3, jsonb_build_object('mimetype', $4))
         on conflict (bucket_id, name) do nothing`,
        [BUCKET, key, claims.sub, key === thumbKey ? "image/jpeg" : contentType]
      );
    }
  });

  const { error } = await new QueryBuilder((f) => withUser(claims.sub, f), "attachments").insert({
    snag_id: snagId,
    update_id: updateId,
    media_type: mediaType,
    file_url: fileKey,
    original_url: originalKey,
    thumbnail_url: thumbKey,
    file_name: fileName || null,
    file_size: file.size,
    uploaded_by: claims.sub,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ error: null });
}
