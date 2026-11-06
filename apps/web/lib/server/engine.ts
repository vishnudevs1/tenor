import "server-only";
import {
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
import { MARKET_BY_SYMBOL, type OrderBook } from "@/lib/markets";
import { db, isUniqueViolation, newId, tx, utcDayKey, type Q } from "./db";
import { getMarkets, getOrderBook, MAX_PRICE_AGE_MS, type MarketSnapshot } from "./venue";

// Evaluation engine (blueprint §3.4). Server-authoritative: the client never computes fills or breaches.
//
// Hedging mode: every order opens its own ticket with its own entry, P&L, TP/SL and close.
// Every read-modify-write locks the account row (SELECT … FOR UPDATE), so concurrent requests
// on different servers can't double-apply a fill or a breach.

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

export interface TicketRow {
  id: number;
  account_id: string;
  market: string;
  qty: number; // signed: + long, − short
  entry: number;
  tp: number | null;
  sl: number | null;
  open_fee: number;
  opened_at: number;
}

/** One closed trade with its full P&L. */
export interface ClosedTrade {
  ticketId: number | null;
  market: string;
  side: "long" | "short";
  qty: number;
  entry: number | null;
  exit: number;
  pnl: number; // gross
  fees: number; // open + close
  net: number;
  openedAt: number | null;
  closedAt: number;
  reason: "close" | "partial" | "tp" | "sl" | "breach" | "pass" | string;
}

export class TradeError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const MIN_ORDER_USD = 10;
const MAX_OPEN_TICKETS = 50;

const lockAccount = (t: Q, id: string) => t.one<AccountRow>("SELECT * FROM accounts WHERE id = $1 FOR UPDATE", [id]);
const getAccount = (q: Q, id: string) => q.one<AccountRow>("SELECT * FROM accounts WHERE id = $1", [id]);
const getTickets = (q: Q, id: string) => q.all<TicketRow>("SELECT * FROM tickets WHERE account_id = $1 ORDER BY opened_at, id", [id]);
const setBalance = (t: Q, a: AccountRow) => t.run("UPDATE accounts SET balance = $1 WHERE id = $2", [a.balance, a.id]);

// ── Marking ────────────────────────────────────────────────────────────────

type Marks = Record<string, number>;

function freshMarks(snap: MarketSnapshot | null): Marks | null {
  if (!snap || Date.now() - snap.at > MAX_PRICE_AGE_MS) return null;
  return Object.fromEntries(Object.values(snap.stats).filter((s) => s.mark > 0).map((s) => [s.symbol, s.mark]));
}

const equityOf = (a: AccountRow, tickets: TicketRow[], marks: Marks) => a.balance + tickets.reduce((s, k) => s + unrealized(k, marks[k.market] ?? k.entry), 0);

/**
 * Close all or part of a ticket at `price`: record the closing fill, book the P&L, then delete or shrink the ticket.
 * The open fee is split pro rata so every history row shows its own exact net P&L.
 * Runs inside a transaction. `portion` is the share of the ticket's size to close, in (0, 1].
 */
async function closeTicketAt(t: Q, a: AccountRow, k: TicketRow, price: number, reason: string, portion = 1) {
  const full = portion >= 1 - 1e-9;
  const qty = Math.abs(k.qty) * (full ? 1 : portion);
  const side: Side = k.qty > 0 ? "sell" : "buy";
  const realized = Math.sign(k.qty) * qty * (price - k.entry);
  const fee = qty * price * TAKER_FEE;
  const openFee = full ? k.open_fee : k.open_fee * portion;
  a.balance += realized - fee;
  await setBalance(t, a);
  await t.run(
    `INSERT INTO fills (account_id, market, side, qty, price, fee, realized_pnl, reason, ts, ticket_id, entry, open_fee, opened_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [a.id, k.market, side, qty, price, fee, realized, full ? reason : "partial", Date.now(), k.id, k.entry, openFee, k.opened_at],
  );
  if (full) await t.run("DELETE FROM tickets WHERE id = $1", [k.id]);
  else await t.run("UPDATE tickets SET qty = $1, open_fee = $2 WHERE id = $3", [k.qty - Math.sign(k.qty) * qty, k.open_fee - openFee, k.id]);
  return { qty, price, fee, realized, remaining: full ? 0 : Math.abs(k.qty) - qty };
}

/**
 * Enforce an account's rules against current marks, inside the caller's transaction (account row locked).
 * Order matters: TP/SL → daily rollover → breach → pass.
 * With a missing mark nothing is enforced (no breaches from bad data — blueprint §14.2).
 */
async function enforce(t: Q, a: AccountRow, marks: Marks) {
  if (a.status !== "active") return;
  let tickets = await getTickets(t, a.id);
  if (tickets.some((k) => !(marks[k.market] > 0))) return;

  for (const k of tickets) {
    const hit = triggered(k, marks[k.market]);
    if (!hit) continue;
    // TP behaves like a limit: fills at its price. SL is a stop: fills at the worse of its price and
    // the market (with slippage), so a gap through the stop isn't filled at a price that no longer exists.
    const market = forcedClosePrice(k, marks[k.market]);
    const price = hit === "tp" ? k.tp! : k.qty > 0 ? Math.min(k.sl!, market) : Math.max(k.sl!, market);
    await closeTicketAt(t, a, k, price, hit);
  }
  tickets = await getTickets(t, a.id);

  const equity = equityOf(a, tickets, marks);
  const today = utcDayKey();
  if (a.day_key !== today) {
    await t.run("UPDATE accounts SET day_key = $1, day_start_equity = $2 WHERE id = $3", [today, equity, a.id]);
    a.day_key = today;
    a.day_start_equity = equity;
  }

  const product = parseProductId(a.product_id)!;
  const ev = evaluate({ phase: "evaluation", initialBalance: a.size, dayStartEquity: a.day_start_equity, equity }, rulesFor(product, a.step));
  if (ev.status === "breached") {
    for (const k of tickets) await closeTicketAt(t, a, k, forcedClosePrice(k, marks[k.market]), "breach");
    a.status = "breached";
    a.breach_reason = ev.reason ?? "rules";
    a.ended_at = Date.now();
    await t.run("UPDATE accounts SET status = 'breached', breach_reason = $1, ended_at = $2 WHERE id = $3", [a.breach_reason, a.ended_at, a.id]);
  } else if (ev.status === "passed") {
    for (const k of tickets) await closeTicketAt(t, a, k, forcedClosePrice(k, marks[k.market]), "pass");
    if (product.steps === 2 && a.step === 1) {
      a.step = 2;
      a.balance = a.size;
      a.day_key = today;
      a.day_start_equity = a.size;
      await t.run("UPDATE accounts SET step = 2, balance = size, day_key = $1, day_start_equity = size WHERE id = $2", [today, a.id]);
    } else {
      a.status = "passed";
      a.ended_at = Date.now();
      await t.run("UPDATE accounts SET status = 'passed', ended_at = $1 WHERE id = $2", [a.ended_at, a.id]);
    }
  }
}

async function settle(accountId: string, marks: Marks | null) {
  if (!marks) return;
  await tx(async (t) => {
    const a = await lockAccount(t, accountId);
    if (a) await enforce(t, a, marks);
  });
}

// ── Views ──────────────────────────────────────────────────────────────────

export interface TicketView {
  id: number;
  market: string;
  qty: number;
  entry: number;
  mark: number;
  notional: number;
  upnl: number;
  tp: number | null;
  sl: number | null;
  openFee: number;
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
  dayStartEquity: number;
  rules: ReturnType<typeof rulesFor>;
  objectives: Evaluation;
  positions: TicketView[];
  createdAt: number;
  endedAt: number | null;
  priceStale: boolean;
}

function toView(a: AccountRow, tickets: TicketRow[], marks: Marks | null): AccountView {
  const product = parseProductId(a.product_id)!;
  const rules = rulesFor(product, a.step);
  const positions = tickets.map((k) => {
    const mark = marks?.[k.market] ?? k.entry;
    return { id: k.id, market: k.market, qty: k.qty, entry: k.entry, mark, notional: Math.abs(k.qty) * mark, upnl: unrealized(k, mark), tp: k.tp, sl: k.sl, openFee: k.open_fee, openedAt: k.opened_at };
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
    dayStartEquity: a.day_start_equity,
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

async function viewOf(accountId: string, marks: Marks | null) {
  const [a, tickets] = await Promise.all([getAccount(db, accountId), getTickets(db, accountId)]);
  return toView(a!, tickets, marks);
}

export async function listAccounts(userId: string): Promise<AccountView[]> {
  const [rows, snap] = await Promise.all([byUser(userId), snapshot()]);
  const marks = freshMarks(snap);
  await Promise.all(rows.filter((r) => r.status === "active").map((r) => settle(r.id, marks)));
  return Promise.all((await byUser(userId)).map((r) => viewOf(r.id, marks)));
}

export async function getAccountView(userId: string, accountId: string) {
  const [, snap] = await Promise.all([owned(userId, accountId), snapshot()]);
  const marks = freshMarks(snap);
  await settle(accountId, marks);
  return viewOf(accountId, marks);
}

/** Closed trades, newest first — one row per trade with gross, fees and net P&L. */
export async function getTradeHistory(userId: string, accountId: string): Promise<ClosedTrade[]> {
  await owned(userId, accountId);
  const rows = await db.all<{
    ticket_id: number | null;
    market: string;
    side: Side;
    qty: number;
    price: number;
    fee: number;
    realized_pnl: number;
    reason: string;
    ts: number;
    entry: number | null;
    open_fee: number | null;
    opened_at: number | null;
  }>(
    `SELECT ticket_id, market, side, qty, price, fee, realized_pnl, reason, ts, entry, open_fee, opened_at
     FROM fills WHERE account_id = $1 AND reason <> 'open' AND reason <> 'order' ORDER BY ts DESC, id DESC LIMIT 200`,
    [accountId],
  );
  return rows.map((r) => {
    const fees = r.fee + (r.open_fee ?? 0);
    return {
      ticketId: r.ticket_id,
      market: r.market,
      side: r.side === "sell" ? "long" : "short", // closing a long is a sell
      qty: r.qty,
      entry: r.entry,
      exit: r.price,
      pnl: r.realized_pnl,
      fees,
      net: r.realized_pnl - fees,
      openedAt: r.opened_at,
      closedAt: r.ts,
      reason: r.reason,
    };
  });
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
  tp?: number | null;
  sl?: number | null;
}

function checkTpSl(dir: number, mark: number, tp: number | null | undefined, sl: number | null | undefined) {
  if (tp != null && !(tp > 0)) throw new TradeError("Take profit must be a positive price");
  if (sl != null && !(sl > 0)) throw new TradeError("Stop loss must be a positive price");
  if (tp != null && (dir > 0 ? tp <= mark : tp >= mark)) throw new TradeError(`Take profit must be ${dir > 0 ? "above" : "below"} the current price`);
  if (sl != null && (dir > 0 ? sl >= mark : sl <= mark)) throw new TradeError(`Stop loss must be ${dir > 0 ? "below" : "above"} the current price`);
}

/** Inactive-account errors are raised after commit so enforcement that just happened isn't rolled back. */
function inactiveError(a: AccountRow) {
  return new TradeError(a.status === "breached" ? "This account was breached" : "This evaluation is complete");
}

/** Open a new ticket. One transaction: enforce → validate → fill → enforce. */
export async function placeOrder(userId: string, accountId: string, input: OrderInput) {
  const m = MARKET_BY_SYMBOL[input.market];
  if (!m) throw new TradeError("Unknown market");
  if (input.side !== "buy" && input.side !== "sell") throw new TradeError("Invalid side");
  if (!Number.isFinite(input.notional) || input.notional < MIN_ORDER_USD) throw new TradeError(`Minimum order is $${MIN_ORDER_USD}`);

  // Ownership check and both venue reads in parallel — this is the latency-critical path.
  const [, snap, book] = await Promise.all([owned(userId, accountId), snapshot(), getOrderBook(m.symbol).catch(() => null)]);
  const marks = freshMarks(snap);
  const stats = snap?.stats[m.symbol];
  if (!marks || !stats || !book) throw new TradeError("Live prices are unavailable right now — try again in a moment", 503);
  if (!stats.open) throw new TradeError(`${m.name} is closed right now — you can still close open trades`);
  const dir = input.side === "buy" ? 1 : -1;
  checkTpSl(dir, stats.mark, input.tp, input.sl);

  const out = await tx(async (t) => {
    const a = (await lockAccount(t, accountId))!;
    await enforce(t, a, marks);
    if (a.status !== "active") return { inactive: a };

    const tickets = await getTickets(t, a.id);
    if (tickets.length >= MAX_OPEN_TICKETS) throw new TradeError(`Maximum ${MAX_OPEN_TICKETS} open trades per account`);
    const fill = walkBook(input.side === "buy" ? book.asks : book.bids, input.notional);
    if (!fill) throw new TradeError("Order is larger than the venue's visible order book");

    const fee = fill.notional * TAKER_FEE;
    const equity = equityOf(a, tickets, marks) - fee;
    // Gross exposure per market (hedged trades count both ways — conservative).
    const gross = tickets.filter((k) => k.market === m.symbol).reduce((s, k) => s + Math.abs(k.qty) * stats.mark, 0) + fill.qty * stats.mark;
    const maxNotional = Math.max(0, equity) * m.maxLeverage;
    if (gross > maxNotional) {
      throw new TradeError(`Max leverage on ${m.assetClass.toLowerCase()} is ${m.maxLeverage}× — you can add up to $${Math.max(0, Math.floor(maxNotional - (gross - fill.qty * stats.mark))).toLocaleString()}`);
    }

    const now = Date.now();
    const row = await t.one<{ id: number }>(
      "INSERT INTO tickets (account_id, market, qty, entry, tp, sl, open_fee, opened_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
      [a.id, m.symbol, dir * fill.qty, fill.avgPrice, input.tp ?? null, input.sl ?? null, fee, now],
    );
    await t.run(
      "INSERT INTO fills (account_id, market, side, qty, price, fee, realized_pnl, reason, ts, ticket_id) VALUES ($1, $2, $3, $4, $5, $6, 0, 'open', $7, $8)",
      [a.id, m.symbol, input.side, fill.qty, fill.avgPrice, fee, now, row!.id],
    );
    a.balance -= fee;
    await setBalance(t, a);
    await enforce(t, a, marks); // the fee alone can tip an account over a limit
    return { fill: { ticketId: row!.id, qty: fill.qty, price: fill.avgPrice, fee }, view: toView(a, await getTickets(t, a.id), marks) };
  });
  if ("inactive" in out) throw inactiveError(out.inactive!);
  return { fill: out.fill, account: out.view };
}

/**
 * Market-close one ticket (or all), fully or partly (`fraction` of each, e.g. 0.25), against the real book.
 * Allowed off-hours: reducing risk is never blocked.
 */
export async function closeTickets(userId: string, accountId: string, ticketId: number | "all", fraction = 1) {
  if (!(fraction > 0 && fraction <= 1)) throw new TradeError("Close size must be between 1% and 100%");
  const [, snap, open] = await Promise.all([owned(userId, accountId), snapshot(), getTickets(db, accountId)]);
  const targets = ticketId === "all" ? open : open.filter((k) => k.id === ticketId);
  if (targets.length === 0) throw new TradeError(ticketId === "all" ? "No open trades" : "This trade is already closed", 409);

  const marks = freshMarks(snap);
  if (!marks) throw new TradeError("Live prices are unavailable right now — try again in a moment", 503);
  const markets = [...new Set(targets.map((k) => k.market))];
  const books = new Map<string, OrderBook | null>(await Promise.all(markets.map(async (s) => [s, await getOrderBook(s).catch(() => null)] as const)));

  const out = await tx(async (t) => {
    const a = (await lockAccount(t, accountId))!;
    if (a.status !== "active") return { inactive: a };
    const ids = new Set(targets.map((k) => k.id));
    const closes = [];
    for (const k of (await getTickets(t, a.id)).filter((x) => ids.has(x.id))) {
      const mark = marks[k.market] ?? k.entry;
      // Don't leave dust: if what would remain is under the minimum order size, close the whole trade.
      const portion = Math.abs(k.qty) * (1 - fraction) * mark < MIN_ORDER_USD ? 1 : fraction;
      const book = books.get(k.market);
      const levels = k.qty > 0 ? book?.bids : book?.asks;
      const fill = levels ? walkBookQty(levels, Math.abs(k.qty) * portion) : null;
      // No visible liquidity (e.g. venue maintenance): fall back to mark with modelled slippage rather than trap the trade.
      const price = fill?.avgPrice ?? forcedClosePrice(k, mark);
      closes.push({ ticketId: k.id, ...(await closeTicketAt(t, a, k, price, "close", portion)) });
    }
    await enforce(t, a, marks);
    return { closes, view: toView(a, await getTickets(t, a.id), marks) };
  });
  if ("inactive" in out) throw inactiveError(out.inactive!);
  return { closes: out.closes, account: out.view };
}

/** Set or clear TP/SL on an open ticket. */
export async function updateTicket(userId: string, accountId: string, ticketId: number, tp: number | null, sl: number | null) {
  const [, snap] = await Promise.all([owned(userId, accountId), snapshot()]);
  const marks = freshMarks(snap);
  const out = await tx(async (t) => {
    const a = (await lockAccount(t, accountId))!;
    if (a.status !== "active") return { inactive: a };
    const k = await t.one<TicketRow>("SELECT * FROM tickets WHERE id = $1 AND account_id = $2", [ticketId, accountId]);
    if (!k) throw new TradeError("This trade is already closed", 409);
    const mark = marks?.[k.market];
    if (!mark) throw new TradeError("Live prices are unavailable right now — try again in a moment", 503);
    checkTpSl(Math.sign(k.qty), mark, tp, sl);
    await t.run("UPDATE tickets SET tp = $1, sl = $2 WHERE id = $3", [tp, sl, k.id]);
    return { view: toView(a, await getTickets(t, a.id), marks) };
  });
  if ("inactive" in out) throw inactiveError(out.inactive!);
  return { account: out.view };
}
