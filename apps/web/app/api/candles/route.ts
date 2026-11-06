import { NextResponse } from "next/server";
import { INTERVALS, MARKET_BY_SYMBOL, type IntervalKey } from "@/lib/markets";
import { getCandles } from "@/lib/server/venue";

// Public: OHLCV from the venue. GET /api/candles?symbol=BTC-USD&interval=5m
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const symbol = q.get("symbol") ?? "";
  const interval = (q.get("interval") ?? "5m") as IntervalKey;
  if (!MARKET_BY_SYMBOL[symbol] || !(interval in INTERVALS)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    return NextResponse.json(await getCandles(symbol, interval));
  } catch {
    return NextResponse.json({ error: "Venue data unavailable" }, { status: 503 });
  }
}
