import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";

export async function GET() {
  const claims = await readSession();
  return NextResponse.json({
    user: claims ? { id: claims.sub, email: claims.email } : null,
  });
}
