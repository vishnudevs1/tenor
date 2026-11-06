import { NextResponse } from "next/server";
import { MARKET_BY_SYMBOL } from "@/lib/markets";
import { getOrderBook, getRecentTrades } from "@/lib/server/venue";

// Public: top of the venue's real order book + recent trades. GET /api/book?symbol=BTC-USD
export async function GET(req: Request) {
  const symbol = new URL(req.url).searchParams.get("symbol") ?? "";
  if (!MARKET_BY_SYMBOL[symbol]) return NextResponse.json({ error: "Unknown market" }, { status: 404 });
  try {
    const [book, trades] = await Promise.all([getOrderBook(symbol), getRecentTrades(symbol)]);
    return NextResponse.json({ bids: book.bids.slice(0, 12), asks: book.asks.slice(0, 12), trades: trades.slice(0, 24), ts: book.ts });
  } catch {
    return NextResponse.json({ error: "Venue data unavailable" }, { status: 503 });
  }
}
