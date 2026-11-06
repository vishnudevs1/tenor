import { NextResponse } from "next/server";
import { getMarkets } from "@/lib/server/venue";

// Public: live stats for every tradable market (cached ~1.5s server-side).
export async function GET() {
  try {
    return NextResponse.json(await getMarkets());
  } catch {
    return NextResponse.json({ error: "Venue data unavailable" }, { status: 503 });
  }
}
