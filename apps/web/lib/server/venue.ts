import "server-only";
import { positionCapFromBook } from "@tenor/rules";
import { INTERVALS, MARKETS, MARKET_BY_SYMBOL, type Candle, type IntervalKey, type MarketStats, type OrderBook } from "@/lib/markets";

// Extended public REST API (no key needed for market data).
const BASE = process.env.EXTENDED_API_URL ?? "https://api.starknet.extended.exchange/api/v1";

/** Marks older than this are not used for fills or breaches (blueprint §3.3 staleness guard). */
export const MAX_PRICE_AGE_MS = 15_000;

type Cached<T> = { at: number; value: T; pending?: Promise<T> };
const cache = new Map<string, Cached<unknown>>();

/** Tiny TTL cache with in-flight de-duplication so N pollers cause one upstream request. */
async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as Cached<T> | undefined;
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  if (hit?.pending) return hit.pending;
  const pending = load().then(
    (value) => {
      cache.set(key, { at: Date.now(), value });
      return value;
    },
    (err) => {
      if (hit) cache.set(key, { ...hit, pending: undefined });
      else cache.delete(key);
      throw err;
    },
  );
  cache.set(key, { at: hit?.at ?? 0, value: hit?.value as T, pending });
  return pending;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(5_000), cache: "no-store", headers: { "User-Agent": "tenor/0.1" } });
  if (!res.ok) throw new Error(`Extended ${path} → ${res.status}`);
  const body = (await res.json()) as { status: string; data: T };
  if (body.status !== "OK") throw new Error(`Extended ${path} → ${body.status}`);
  return body.data;
}

const num = (s: unknown) => (typeof s === "string" || typeof s === "number" ? Number(s) : NaN);

interface RawMarket {
  name: string;
  status: string;
  active: boolean;
  isOffHours: boolean;
  marketStats: Record<string, string>;
}

export interface MarketSnapshot {
  stats: Record<string, MarketStats>;
  at: number;
}

export function getMarkets(): Promise<MarketSnapshot> {
  return cached("markets", 1_500, async () => {
    const symbols = MARKETS.map((m) => m.symbol).join("&market=");
    const raw = await get<RawMarket[]>(`/info/markets?market=${symbols}`);
    const stats: Record<string, MarketStats> = {};
    for (const r of raw) {
      if (!MARKET_BY_SYMBOL[r.name]) continue;
      const s = r.marketStats;
      const mark = num(s.markPrice);
      stats[r.name] = {
        symbol: r.name,
        mark,
        index: num(s.indexPrice),
        bid: num(s.bidPrice),
        ask: num(s.askPrice),
        change24h: num(s.dailyPriceChangePercentage),
        high24h: num(s.dailyHigh),
        low24h: num(s.dailyLow),
        volume24h: num(s.dailyVolume),
        openInterest: num(s.openInterest),
        funding: num(s.fundingRate),
        open: r.active && r.status === "ACTIVE" && !r.isOffHours && mark > 0,
        positionCap: 0, // filled from book depth by getPositionCaps()
      };
    }
    return { stats, at: Date.now() };
  });
}

interface RawBook {
  bid: { price: string; qty: string }[];
  ask: { price: string; qty: string }[];
}

export function getOrderBook(symbol: string): Promise<OrderBook> {
  return cached(`book:${symbol}`, 500, async () => {
    const raw = await get<RawBook>(`/info/markets/${encodeURIComponent(symbol)}/orderbook`);
    const map = (l: { price: string; qty: string }) => ({ price: num(l.price), qty: num(l.qty) });
    return {
      symbol,
      bids: raw.bid.map(map).sort((a, b) => b.price - a.price),
      asks: raw.ask.map(map).sort((a, b) => a.price - b.price),
      ts: Date.now(),
    };
  });
}

interface RawCandle {
  o: string;
  h: string;
  l: string;
  c: string;
  v?: string;
  T: number;
}

export function getCandles(symbol: string, interval: IntervalKey, limit = 300): Promise<Candle[]> {
  return cached(`candles:${symbol}:${interval}`, 10_000, async () => {
    const raw = await get<RawCandle[]>(`/info/candles/${encodeURIComponent(symbol)}/trades?interval=${INTERVALS[interval]}&limit=${limit}`);
    return raw
      .map((c) => ({ time: Math.floor(c.T / 1000), open: num(c.o), high: num(c.h), low: num(c.l), close: num(c.c), volume: num(c.v ?? 0) }))
      .sort((a, b) => a.time - b.time);
  });
}

export interface RecentTrade {
  price: number;
  qty: number;
  side: "buy" | "sell";
  ts: number;
}

export function getRecentTrades(symbol: string): Promise<RecentTrade[]> {
  return cached(`trades:${symbol}`, 2_000, async () => {
    const raw = await get<{ S: string; p: string; q: string; T: number }[]>(`/info/markets/${encodeURIComponent(symbol)}/trades`);
    return raw.slice(0, 40).map((t) => ({ price: num(t.p), qty: num(t.q), side: t.S === "BUY" ? "buy" : "sell", ts: t.T }));
  });
}

/** Per-market position caps from live ±2% book depth. Depth moves slowly, so a 60s cache is plenty. */
export function getPositionCaps(): Promise<Record<string, number>> {
  return cached("caps", 60_000, async () => {
    const entries = await Promise.all(
      MARKETS.map(async (m) => [m.symbol, await getOrderBook(m.symbol).then((b) => positionCapFromBook(b.bids, b.asks), () => 0)] as const),
    );
    return Object.fromEntries(entries.filter(([, cap]) => cap > 0));
  });
}
