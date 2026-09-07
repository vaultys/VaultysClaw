import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

function appriseApiUrl(): string | null {
  const url = process.env.APPRISE_API_URL;
  return url ? url.replace(/\/+$/, "") : null;
}

export async function GET() {
  await requireAdmin();

  const base = appriseApiUrl();
  if (!base) {
    return new NextResponse("APPRISE_API_URL is not configured", { status: 503 });
  }

  const res = await fetch(`${base}/details/`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    return new NextResponse(`Apprise /details failed: ${res.status}`, { status: 502 });
  }

  const details = await res.json();
  return NextResponse.json(details);
}
