import { NextResponse } from "next/server";
import { readObject, verifySignedRequest, BUCKET } from "@/lib/storage/local";

// Serves a private attachment for a valid HMAC-signed URL (see
// createSignedPath). The signature is the capability — same model as a
// Supabase signed URL — so no session check here.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const key = path.map(decodeURIComponent).join("/");
  const url = new URL(request.url);

  if (!verifySignedRequest(key, url.searchParams.get("exp"), url.searchParams.get("sig"))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const obj = await readObject(BUCKET, key);
  if (!obj) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(obj.bytes), {
    headers: {
      "content-type": obj.contentType,
      "cache-control": "private, max-age=3600",
    },
  });
}
