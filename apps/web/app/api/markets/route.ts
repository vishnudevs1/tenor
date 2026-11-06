import { NextResponse } from "next/server";
import { getMarkets, getPositionCaps } from "@/lib/server/venue";

// Public: live stats for every tradable market (cached ~1.5s server-side), with position caps (60s).
export async function GET() {
  try {
    const [m, caps] = await Promise.all([getMarkets(), getPositionCaps().catch(() => ({}) as Record<string, number>)]);
    const stats = Object.fromEntries(Object.entries(m.stats).map(([k, s]) => [k, { ...s, positionCap: caps[k] ?? 0 }]));
    return NextResponse.json({ stats, at: m.at });
  } catch {
    return NextResponse.json({ error: "Venue data unavailable" }, { status: 503 });
  }
}
