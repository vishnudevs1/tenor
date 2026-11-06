import "server-only";
import {
  applyFill,
  evaluate,
  forcedClosePrice,
  parseProductId,
  productName,
  rulesFor,
  TAKER_FEE,
  triggered,
  unrealized,
  walkBook,
  walkBookQty,
  type Evaluation,
  type Side,
} from "@tenor/rules";
import { MARKET_BY_SYMBOL } from "@/lib/markets";
import { db, isUniqueViolation, newId, tx, utcDayKey, type Q } from "./db";
import { getMarkets, getOrderBook, MAX_PRICE_AGE_MS, type MarketSnapshot } from "./venue";

// Evaluation engine (blueprint §3.4). Server-authoritative: the client never computes fills or breaches.
// Every read-modify-write runs in a transaction that locks the account row (SELECT … FOR UPDATE),
// so concurrent requests on different servers can't double-apply a fill or a breach.

export interface AccountRow {
  id: string;
  user_id: string;
  order_id: string | null;
  product_id: string;
  size: number;
  demo: number;
  step: number;
  status: "active" | "passed" | "breached";
  breach_reason: string | null;
  balance: number;
  day_key: string;
  day_start_equity: number;
  created_at: number;
  ended_at: number | null;
}

export interface PositionRow {
  account_id: string;
  market: string;
  qty: number;
  entry: number;
  tp: number | null;
  sl: number | null;
  opened_at: number;
}

export interface FillRow {
  id: number;
  market: string;
  side: Side;
  qty: number;
  price: number;
  fee: number;
  realized_pnl: number;
  reason: string;
  ts: number;
}

export class TradeError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const MIN_ORDER_USD = 10;

const lockAccount = (t: Q, id: string) => t.one<AccountRow>("SELECT * FROM accounts WHERE id = $1 FOR UPDATE", [id]);
const getAccount = (q: Q, id: string) => q.one<AccountRow>("SELECT * FROM accounts WHERE id = $1", [id]);
const getPositions = (q: Q, id: string) => q.all<PositionRow>("SELECT * FROM positions WHERE account_id = $1 ORDER BY opened_at", [id]);
const setBalance = (t: Q, a: AccountRow) => t.run("UPDATE accounts SET balance = $1 WHERE id = $2", [a.balance, a.id]);
const insertFill = (t: Q, a: AccountRow, market: string, side: Side, qty: number, price: number, fee: number, realized: number, reason: string) =>
  t.run("INSERT INTO fills (account_id, market, side, qty, price, fee, realized_pnl, reason, ts) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)", [
    a.id,
    market,
    side,
    qty,
    price,
    fee,
    realized,
    reason,
    Date.now(),
  ]);

// ── Marking ────────────────────────────────────────────────────────────────

function freshMarks(snap: MarketSnapshot | null): Record<string, number> | null {
  if (!snap || Date.now() - snap.at > MAX_PRICE_AGE_MS) return null;
  return Object.fromEntries(Object.values(snap.stats).filter((s) => s.mark > 0).map((s) => [s.symbol, s.mark]));
}

function equityOf(a: AccountRow, positions: PositionRow[], marks: Record<string, number>) {
  return a.balance + positions.reduce((sum, p) => sum + unrealized(p, marks[p.market] ?? p.entry), 0);
}

/** Close a position at mark with modelled slippage (TP/SL, breach, pass). Runs inside a transaction. */
async function forceClose(t: Q, a: AccountRow, p: PositionRow, mark: number, reason: string) {
  const price = forcedClosePrice(p, mark);
  const qty = Math.abs(p.qty);
  const side: Side = p.qty > 0 ? "sell" : "buy";
  const { realized } = applyFill(p, side, qty, price);
  const fee = qty * price * TAKER_FEE;
  a.balance += realized - fee;
  await setBalance(t, a);
  await insertFill(t, a, p.market, side, qty, price, fee, realized, reason);
  await t.run("DELETE FROM positions WHERE account_id = $1 AND market = $2", [a.id, p.market]);
}

/**
 * Bring an account up to date against current marks and enforce its rules.
 * Order matters: TP/SL → daily rollover → breach → pass.
 * With stale or missing prices nothing is enforced (no breaches from bad data — blueprint §14.2).
 */
async function settle(accountId: string, marks: Record<string, number> | null) {
  if (!marks) return;
  await tx(async (t) => {
    const a = await lockAccount(t, accountId);
    if (!a || a.status !== "active") return;
    let positions = await getPositions(t, a.id);
    if (positions.some((p) => !(marks[p.market] > 0))) return;

    for (const p of positions) {
      const hit = triggered(p, marks[p.market]);
      if (hit) await forceClose(t, a, p, marks[p.market], hit);
    }
    positions = await getPositions(t, a.id);

    const equity = equityOf(a, positions, marks);
    const today = utcDayKey();
    if (a.day_key !== today) {
      await t.run("UPDATE accounts SET day_key = $1, day_start_equity = $2 WHERE id = $3", [today, equity, a.id]);
      a.day_key = today;
      a.day_start_equity = equity;
    }

    const product = parseProductId(a.product_id)!;
    const ev = evaluate({ phase: "evaluation", initialBalance: a.size, dayStartEquity: a.day_start_equity, equity }, rulesFor(product, a.step));
    if (ev.status === "breached") {
      for (const p of positions) await forceClose(t, a, p, marks[p.market], "breach");
      await t.run("UPDATE accounts SET status = 'breached', breach_reason = $1, ended_at = $2 WHERE id = $3", [ev.reason ?? "rules", Date.now(), a.id]);
    } else if (ev.status === "passed") {
      for (const p of positions) await forceClose(t, a, p, marks[p.market], "pass");
      if (product.steps === 2 && a.step === 1) {
        await t.run("UPDATE accounts SET step = step + 1, balance = size, day_key = $1, day_start_equity = size WHERE id = $2", [today, a.id]);
      } else {
        await t.run("UPDATE accounts SET status = 'passed', ended_at = $1 WHERE id = $2", [Date.now(), a.id]);
      }
    }
  });
}

// ── Views ──────────────────────────────────────────────────────────────────

export interface PositionView {
  market: string;
  qty: number;
  entry: number;
  mark: number;
  notional: number;
  upnl: number;
  tp: number | null;
  sl: number | null;
  openedAt: number;
}

export interface AccountView {
  id: string;
  name: string;
  productId: string;
  size: number;
  demo: boolean;
  step: number;
  steps: number;
  status: AccountRow["status"];
  breachReason: string | null;
  balance: number;
  equity: number;
  upnl: number;
  todayPnl: number;
  rules: ReturnType<typeof rulesFor>;
  objectives: Evaluation;
  positions: PositionView[];
  createdAt: number;
  endedAt: number | null;
  priceStale: boolean;
}

async function toView(a: AccountRow, marks: Record<string, number> | null): Promise<AccountView> {
  const product = parseProductId(a.product_id)!;
  const rules = rulesFor(product, a.step);
  const positions = (await getPositions(db, a.id)).map((p) => {
    const mark = marks?.[p.market] ?? p.entry;
    return { market: p.market, qty: p.qty, entry: p.entry, mark, notional: Math.abs(p.qty) * mark, upnl: unrealized(p, mark), tp: p.tp, sl: p.sl, openedAt: p.opened_at };
  });
  const upnl = positions.reduce((s, p) => s + p.upnl, 0);
  const equity = a.balance + upnl;
  return {
    id: a.id,
    name: productName(product),
    productId: a.product_id,
    size: a.size,
    demo: a.demo === 1,
    step: a.step,
    steps: product.steps,
    status: a.status,
    breachReason: a.breach_reason,
    balance: a.balance,
    equity,
    upnl,
    todayPnl: a.status === "active" ? equity - a.day_start_equity : 0,
    rules,
    objectives: evaluate({ phase: "evaluation", initialBalance: a.size, dayStartEquity: a.day_start_equity, equity }, rules),
    positions,
    createdAt: a.created_at,
    endedAt: a.ended_at,
    priceStale: !marks,
  };
}

async function snapshot() {
  try {
    return await getMarkets();
  } catch {
    return null;
  }
}

async function owned(userId: string, accountId: string) {
  const a = await getAccount(db, accountId);
  if (!a || a.user_id !== userId) throw new TradeError("Account not found", 404);
  return a;
}

const byUser = (userId: string) => db.all<AccountRow>("SELECT * FROM accounts WHERE user_id = $1 ORDER BY created_at DESC", [userId]);

export async function listAccounts(userId: string): Promise<AccountView[]> {
  const marks = freshMarks(await snapshot());
  for (const r of await byUser(userId)) if (r.status === "active") await settle(r.id, marks);
  return Promise.all((await byUser(userId)).map((r) => toView(r, marks)));
}

export async function getAccountView(userId: string, accountId: string) {
  await owned(userId, accountId);
  const marks = freshMarks(await snapshot());
  await settle(accountId, marks);
  return toView((await getAccount(db, accountId))!, marks);
}

export async function getFills(userId: string, accountId: string) {
  await owned(userId, accountId);
  return db.all<FillRow>("SELECT id, market, side, qty, price, fee, realized_pnl, reason, ts FROM fills WHERE account_id = $1 ORDER BY ts DESC, id DESC LIMIT 100", [accountId]);
}

/** Risk sweep over every active account — called by /api/cron/risk on a schedule. */
export async function riskSweep() {
  const marks = freshMarks(await snapshot());
  if (!marks) return { checked: 0, stale: true };
  const ids = await db.all<{ id: string }>("SELECT id FROM accounts WHERE status = 'active'");
  for (const { id } of ids) await settle(id, marks);
  return { checked: ids.length, stale: false };
}

// ── Accounts ───────────────────────────────────────────────────────────────

/** Insert a fresh evaluation account (pass the transaction when part of a larger write). */
export async function insertAccount(q: Q, userId: string, productId: string, orderId: string | null) {
  const product = parseProductId(productId);
  if (!product) throw new TradeError("Unknown product");
  const id = newId(product.demo ? "DM" : "TN");
  await q.run(
    `INSERT INTO accounts (id, user_id, order_id, product_id, size, demo, step, status, balance, day_key, day_start_equity, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 1, 'active', $5, $7, $5, $8)`,
    [id, userId, orderId, productId, product.size, product.demo ? 1 : 0, utcDayKey(), Date.now()],
  );
  return id;
}

export async function createDemoAccount(userId: string, productId: string) {
  const product = parseProductId(productId);
  if (!product?.demo) throw new TradeError("Not a demo product");
  try {
    return await insertAccount(db, userId, productId, null);
  } catch (e) {
    if (isUniqueViolation(e)) throw new TradeError("You already have an active demo account");
    throw e;
  }
}

// ── Orders ─────────────────────────────────────────────────────────────────

export interface OrderInput {
  market: string;
  side: Side;
  notional: number; // USD
  reduceOnly?: boolean;
  tp?: number | null;
  sl?: number | null;
}

export async function placeOrder(userId: string, accountId: string, input: OrderInput) {
  await owned(userId, accountId);
  const m = MARKET_BY_SYMBOL[input.market];
  if (!m) throw new TradeError("Unknown market");
  if (input.side !== "buy" && input.side !== "sell") throw new TradeError("Invalid side");
  if (!Number.isFinite(input.notional) || input.notional < MIN_ORDER_USD) throw new TradeError(`Minimum order is $${MIN_ORDER_USD}`);

  const [snap, book] = await Promise.all([snapshot(), getOrderBook(m.symbol).catch(() => null)]);
  const marks = freshMarks(snap);
  const stats = snap?.stats[m.symbol];
  if (!marks || !stats || !book) throw new TradeError("Live prices are unavailable right now — try again in a moment", 503);
  if (!stats.open) throw new TradeError(`${m.name} is closed right now`);

  await settle(accountId, marks);

  const result = await tx(async (t) => {
    const a = (await lockAccount(t, accountId))!;
    if (a.status !== "active") throw new TradeError(a.status === "breached" ? "This account was breached" : "This evaluation is complete");
    const positions = await getPositions(t, a.id);
    const current = positions.find((p) => p.market === m.symbol);
    const levels = input.side === "buy" ? book.asks : book.bids;

    let fill;
    if (input.reduceOnly) {
      const opposite = current && (input.side === "sell" ? current.qty > 0 : current.qty < 0);
      if (!current || !opposite) throw new TradeError("Reduce-only order would open or increase a position");
      fill = walkBookQty(levels, Math.min(Math.abs(current.qty), input.notional / stats.mark));
    } else {
      fill = walkBook(levels, input.notional);
    }
    if (!fill) throw new TradeError("Order is larger than the venue's visible order book");

    const before = current ?? { qty: 0, entry: 0 };
    const { pos, realized } = applyFill(before, input.side, fill.qty, fill.avgPrice);
    const fee = fill.notional * TAKER_FEE;
    const equity = equityOf(a, positions, marks) - fee;

    const growing = Math.abs(pos.qty) > Math.abs(before.qty) + 1e-12;
    const maxNotional = Math.max(0, equity) * m.maxLeverage;
    if (growing && Math.abs(pos.qty) * stats.mark > maxNotional) {
      throw new TradeError(`Max leverage on ${m.assetClass.toLowerCase()} is ${m.maxLeverage}× — position limit is $${Math.floor(maxNotional).toLocaleString()}`);
    }

    // TP/SL must sit on the profitable / losing side of mark for the resulting direction.
    const dir = Math.sign(pos.qty);
    const flipped = before.qty !== 0 && dir !== Math.sign(before.qty);
    const tp = input.tp ?? (flipped ? null : (current?.tp ?? null));
    const sl = input.sl ?? (flipped ? null : (current?.sl ?? null));
    if (dir !== 0) {
      if (tp != null && (dir > 0 ? tp <= stats.mark : tp >= stats.mark)) throw new TradeError("Take profit must be beyond the current price");
      if (sl != null && (dir > 0 ? sl >= stats.mark : sl <= stats.mark)) throw new TradeError("Stop loss must be on the losing side of the current price");
    }

    a.balance += realized - fee;
    await setBalance(t, a);
    if (Math.abs(pos.qty) < 1e-12) {
      await t.run("DELETE FROM positions WHERE account_id = $1 AND market = $2", [a.id, m.symbol]);
    } else {
      await t.run(
        `INSERT INTO positions (account_id, market, qty, entry, tp, sl, opened_at) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (account_id, market) DO UPDATE SET qty = excluded.qty, entry = excluded.entry, tp = excluded.tp, sl = excluded.sl`,
        [a.id, m.symbol, pos.qty, pos.entry, tp, sl, current && !flipped ? current.opened_at : Date.now()],
      );
    }
    await insertFill(t, a, m.symbol, input.side, fill.qty, fill.avgPrice, fee, realized, "order");
    return { qty: fill.qty, price: fill.avgPrice, fee, realized };
  });

  await settle(accountId, marks); // the fee alone can tip an account over a limit
  return { fill: result, account: await toView((await getAccount(db, accountId))!, marks) };
}

export async function closePosition(userId: string, accountId: string, market: string) {
  await owned(userId, accountId);
  const p = await db.one<PositionRow>("SELECT * FROM positions WHERE account_id = $1 AND market = $2", [accountId, market]);
  if (!p) throw new TradeError("No open position in this market");
  const snap = await snapshot();
  const mark = snap?.stats[market]?.mark ?? 0;
  return placeOrder(userId, accountId, {
    market,
    side: p.qty > 0 ? "sell" : "buy",
    notional: Math.max(MIN_ORDER_USD, Math.abs(p.qty) * mark * 1.01), // reduce-only caps at position size
    reduceOnly: true,
  });
}
