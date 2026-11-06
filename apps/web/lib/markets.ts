// Tradable markets. Prices, books and candles come from Extended (an Arc-native venue).
// Leverage caps follow the one-table rule in blueprint §2.4.

export interface Market {
  symbol: string; // Extended market name
  base: string;
  name: string;
  assetClass: "Crypto majors" | "Alts" | "Gold" | "FX majors";
  maxLeverage: number;
  priceDecimals: number;
}

export const MARKETS: Market[] = [
  { symbol: "BTC-USD", base: "BTC", name: "Bitcoin", assetClass: "Crypto majors", maxLeverage: 5, priceDecimals: 1 },
  { symbol: "ETH-USD", base: "ETH", name: "Ethereum", assetClass: "Crypto majors", maxLeverage: 5, priceDecimals: 2 },
  { symbol: "SOL-USD", base: "SOL", name: "Solana", assetClass: "Alts", maxLeverage: 3, priceDecimals: 3 },
  { symbol: "XAU-USD", base: "XAU", name: "Gold", assetClass: "Gold", maxLeverage: 8, priceDecimals: 2 },
  { symbol: "EUR-USD", base: "EUR", name: "Euro / US Dollar", assetClass: "FX majors", maxLeverage: 10, priceDecimals: 5 },
  { symbol: "USDJPY-USD", base: "USDJPY", name: "US Dollar / Yen", assetClass: "FX majors", maxLeverage: 10, priceDecimals: 3 },
];

export const MARKET_BY_SYMBOL = Object.fromEntries(MARKETS.map((m) => [m.symbol, m])) as Record<string, Market>;
export const DEFAULT_MARKET = "BTC-USD";

export function displayPair(m: Market) {
  return m.symbol === "USDJPY-USD" ? "USD/JPY" : `${m.base}/USD`;
}

export function formatPrice(n: number, m: Market) {
  return n.toLocaleString("en-US", { minimumFractionDigits: m.priceDecimals, maximumFractionDigits: m.priceDecimals });
}

/** Shape returned by /api/markets — what the client sees of a venue market. */
export interface MarketStats {
  symbol: string;
  mark: number;
  index: number;
  bid: number;
  ask: number;
  change24h: number; // fraction
  high24h: number;
  low24h: number;
  volume24h: number; // USD
  openInterest: number; // USD
  funding: number; // hourly rate, fraction
  open: boolean; // false during off-hours or if the venue paused the market
}

export interface BookLevel {
  price: number;
  qty: number;
}

export interface OrderBook {
  symbol: string;
  bids: BookLevel[];
  asks: BookLevel[];
  ts: number;
}

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Venue-side candle intervals (history available over REST). */
export const INTERVALS = { "1m": "PT1M", "5m": "PT5M", "15m": "PT15M", "1h": "PT1H", "4h": "PT4H", "1d": "P1D" } as const;
export type IntervalKey = keyof typeof INTERVALS;

/** Every interval the chart offers. Sub-minute candles are built live in the browser from the trade stream. */
export const CHART_INTERVALS = ["1s", "5s", "1m", "5m", "15m", "1h", "4h", "1d"] as const;
export type ChartInterval = (typeof CHART_INTERVALS)[number];
export const INTERVAL_SECONDS: Record<ChartInterval, number> = { "1s": 1, "5s": 5, "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400 };
export const isVenueInterval = (i: ChartInterval): i is IntervalKey => i in INTERVALS;
