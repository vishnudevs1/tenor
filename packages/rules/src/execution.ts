// Pure execution math for the evaluation engine (blueprint §3.4):
// simulated fills walk the venue's real order book, so slippage is what the market would have charged.

export type Side = "buy" | "sell";

export interface Level {
  price: number;
  qty: number; // base units
}

export interface Fill {
  qty: number; // base units filled
  notional: number; // USD
  avgPrice: number;
}

/** Taker fee charged on every simulated fill (fraction of notional). */
export const TAKER_FEE = 0.0005;
/** Modelled slippage for closes the engine forces at mark (TP/SL, breach, pass). */
export const FORCED_CLOSE_SLIPPAGE = 0.0005;

/**
 * Walk the book for a USD notional. Buys consume asks (lowest first), sells consume bids (highest first).
 * Returns null when the visible book can't absorb the order — we never invent liquidity.
 */
export function walkBook(levels: Level[], notional: number): Fill | null {
  if (!(notional > 0)) return null;
  let remaining = notional;
  let qty = 0;
  for (const l of levels) {
    if (!(l.price > 0 && l.qty > 0)) continue;
    const take = Math.min(remaining, l.price * l.qty);
    qty += take / l.price;
    remaining -= take;
    if (remaining <= 1e-9) break;
  }
  if (remaining > 1e-6) return null;
  return { qty, notional, avgPrice: notional / qty };
}

/** Same as walkBook but for a fixed base quantity (used by reduce-only and closes). */
export function walkBookQty(levels: Level[], qty: number): Fill | null {
  if (!(qty > 0)) return null;
  let remaining = qty;
  let notional = 0;
  for (const l of levels) {
    if (!(l.price > 0 && l.qty > 0)) continue;
    const take = Math.min(remaining, l.qty);
    notional += take * l.price;
    remaining -= take;
    if (remaining <= 1e-12) break;
  }
  if (remaining > 1e-9) return null;
  return { qty, notional, avgPrice: notional / qty };
}

export interface PositionState {
  qty: number; // signed: + long, − short
  entry: number;
}

/**
 * Apply a fill to a net position. Same direction averages the entry; the opposite direction realizes PnL
 * on the closed part and, if it flips, opens the remainder at the fill price.
 */
export function applyFill(pos: PositionState, side: Side, qty: number, price: number): { pos: PositionState; realized: number } {
  const signed = side === "buy" ? qty : -qty;
  if (pos.qty === 0 || Math.sign(pos.qty) === Math.sign(signed)) {
    const total = pos.qty + signed;
    const entry = (Math.abs(pos.qty) * pos.entry + qty * price) / Math.abs(total);
    return { pos: { qty: total, entry }, realized: 0 };
  }
  const closing = Math.min(Math.abs(pos.qty), qty);
  const realized = closing * (price - pos.entry) * Math.sign(pos.qty);
  const total = pos.qty + signed;
  if (Math.abs(total) < 1e-12) return { pos: { qty: 0, entry: 0 }, realized };
  // Flipped through zero: the remainder is a fresh position at the fill price.
  const entry = Math.sign(total) === Math.sign(pos.qty) ? pos.entry : price;
  return { pos: { qty: total, entry }, realized };
}

export const unrealized = (pos: PositionState, mark: number) => pos.qty * (mark - pos.entry);

/** Price at which a forced close at mark is assumed to fill. */
export function forcedClosePrice(pos: PositionState, mark: number) {
  return pos.qty > 0 ? mark * (1 - FORCED_CLOSE_SLIPPAGE) : mark * (1 + FORCED_CLOSE_SLIPPAGE);
}

/** TP/SL trigger check at mark. */
export function triggered(pos: PositionState & { tp: number | null; sl: number | null }, mark: number): "tp" | "sl" | null {
  if (pos.qty > 0) {
    if (pos.sl != null && mark <= pos.sl) return "sl";
    if (pos.tp != null && mark >= pos.tp) return "tp";
  } else if (pos.qty < 0) {
    if (pos.sl != null && mark >= pos.sl) return "sl";
    if (pos.tp != null && mark <= pos.tp) return "tp";
  }
  return null;
}
