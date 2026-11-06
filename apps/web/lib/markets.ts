// Tradable markets. Prices, books and candles come from Extended (an Arc-native venue).
// Leverage: 5× is the most any trader can use (Tenor policy); alts are tighter at 3×.

/** Hard ceiling on leverage for every account and market. */
export const MAX_LEVERAGE = 5;

export type MarketCategory = "Crypto" | "Commodities" | "FX";

export interface Market {
  symbol: string; // Extended market name
  base: string;
  name: string;
  assetClass: "Crypto majors" | "Alts" | "Gold" | "FX majors";
  category: MarketCategory;
  maxLeverage: number;
  priceDecimals: number;
  color: string; // icon tile colour
}

export const MARKETS: Market[] = [
  { symbol: "BTC-USD", base: "BTC", name: "Bitcoin", assetClass: "Crypto majors", category: "Crypto", maxLeverage: 5, priceDecimals: 1, color: "#f7931a" },
  { symbol: "ETH-USD", base: "ETH", name: "Ethereum", assetClass: "Crypto majors", category: "Crypto", maxLeverage: 5, priceDecimals: 2, color: "#627eea" },
  { symbol: "SOL-USD", base: "SOL", name: "Solana", assetClass: "Alts", category: "Crypto", maxLeverage: 3, priceDecimals: 3, color: "#9945ff" },
  { symbol: "XAU-USD", base: "XAU", name: "Gold", assetClass: "Gold", category: "Commodities", maxLeverage: 5, priceDecimals: 2, color: "#d4af37" },
  { symbol: "EUR-USD", base: "EUR", name: "Euro / US Dollar", assetClass: "FX majors", category: "FX", maxLeverage: 5, priceDecimals: 5, color: "#2b6cb0" },
  { symbol: "USDJPY-USD", base: "USDJPY", name: "US Dollar / Yen", assetClass: "FX majors", category: "FX", maxLeverage: 5, priceDecimals: 3, color: "#c53030" },
];

export const MARKET_BY_SYMBOL = Object.fromEntries(MARKETS.map((m) => [m.symbol, m])) as Record<string, Market>;
export const DEFAULT_MARKET = "BTC-USD";

export function displayPair(m: Market) {
  // Settled in USDC on Arc, so quote everything in USDC (FX keeps its familiar pair name).
  return m.category === "FX" ? (m.symbol === "USDJPY-USD" ? "USD/JPY" : `${m.base}/USD`) : `${m.base}-USDC`;
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
  positionCap: number; // max open notional per account in this market (USD), sized from live book depth
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
