// End-to-end engine test against LIVE Extended market data, on a throwaway DB.
// Run: npm run test:engine (uses a throwaway DB in .data-test/)
import { register } from "node:module";
import assert from "node:assert/strict";
register(new URL("./loader.mjs", import.meta.url));

const { db } = await import("@/lib/server/db");
const E = await import("@/lib/server/engine");
const { getMarkets } = await import("@/lib/server/venue");

const U = "test-user";
await db.run("INSERT INTO users (id, email, name, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING", [U, "t@example.com", "Tester", Date.now()]);
const ok = (name) => console.log("  ✓", name);
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const rejects = async (p, re, name) => {
  await assert.rejects(p, (e) => (re.test(e.message) ? true : (console.log("    got:", e.message), false)));
  ok(name);
};
const setBal = (bal, day, id) => db.run("UPDATE accounts SET balance = $1, day_start_equity = $2 WHERE id = $3", [bal, day, id]);
const insertTicket = (acct, market, qty, entry, tp = null, sl = null) =>
  db.one("INSERT INTO tickets (account_id, market, qty, entry, tp, sl, open_fee, opened_at) VALUES ($1,$2,$3,$4,$5,$6,0,$7) RETURNING id", [acct, market, qty, entry, tp, sl, Date.now()]).then((r) => r.id);

console.log("separate trades (hedging mode, live BTC book)");
const demo = await E.createDemoAccount(U, "demo-classic-1");
await rejects(E.createDemoAccount(U, "demo-classic-1"), /already have an active demo/, "only one active demo");

const a1 = await E.placeOrder(U, demo, { market: "BTC-USD", side: "buy", notional: 20_000 });
const a2 = await E.placeOrder(U, demo, { market: "BTC-USD", side: "buy", notional: 5_000 });
const a3 = await E.placeOrder(U, demo, { market: "BTC-USD", side: "sell", notional: 3_000 });
console.log(`    #${a1.fill.ticketId} long @ ${a1.fill.price}, #${a2.fill.ticketId} long @ ${a2.fill.price}, #${a3.fill.ticketId} short @ ${a3.fill.price}`);
assert.equal(a3.account.positions.length, 3, "three independent tickets, not one netted position");
assert.deepEqual(a3.account.positions.map((p) => Math.sign(p.qty)), [1, 1, -1]);
ok("each order opens its own trade (long, long, short coexist)");

await rejects(E.placeOrder(U, demo, { market: "BTC-USD", side: "buy", notional: 30_000 }), /Max leverage/, "5× gross leverage cap per market");
await rejects(E.placeOrder(U, demo, { market: "BTC-USD", side: "buy", notional: 5 }), /Minimum order/, "minimum order size");
await rejects(E.placeOrder(U, demo, { market: "BTC-USD", side: "buy", notional: 100, tp: 1 }), /Take profit must be above/, "TP on wrong side rejected");
await rejects(E.placeOrder(U, demo, { market: "BTC-USD", side: "sell", notional: 100, sl: 1 }), /Stop loss must be above/, "short SL on wrong side rejected");

const mark = (await getMarkets()).stats["BTC-USD"].mark;
let r = await E.updateTicket(U, demo, a1.fill.ticketId, Math.round(mark * 1.2), Math.round(mark * 0.8));
assert.equal(r.account.positions.find((p) => p.id === a1.fill.ticketId).tp, Math.round(mark * 1.2));
await rejects(E.updateTicket(U, demo, a1.fill.ticketId, Math.round(mark * 0.5), null), /above/, "TP/SL edit is validated");
ok("TP/SL can be edited on an open trade");

const c1 = await E.closeTickets(U, demo, a2.fill.ticketId);
assert.equal(c1.account.positions.length, 2);
assert.ok(!c1.account.positions.some((p) => p.id === a2.fill.ticketId));
ok(`closing #${a2.fill.ticketId} leaves the other trades open`);
await rejects(E.closeTickets(U, demo, a2.fill.ticketId), /already closed/, "closing twice is a clean 409");

let hist = await E.getTradeHistory(U, demo);
assert.equal(hist.length, 1);
const h = hist[0];
near(h.net, h.pnl - h.fees);
assert.equal(h.ticketId, a2.fill.ticketId);
assert.equal(h.side, "long");
near(h.entry, a2.fill.price);
ok(`per-trade P&L: #${h.ticketId} entry ${h.entry} → exit ${h.exit}, gross ${h.pnl.toFixed(2)}, fees ${h.fees.toFixed(2)}, net ${h.net.toFixed(2)}`);

const before = (await E.getAccountView(U, demo)).balance;
const all = await E.closeTickets(U, demo, "all");
assert.equal(all.account.positions.length, 0);
hist = await E.getTradeHistory(U, demo);
assert.equal(hist.length, 3);
// Each history row's fees include its open fee, so the books balance exactly per trade.
near(all.account.balance, 10_000 + hist.reduce((s, x) => s + x.net, 0));
assert.ok(all.account.balance !== before);
ok("Close all flattens every trade; balance = start + Σ per-trade net");
await rejects(E.getAccountView("someone-else", demo), /not found/, "other users can't read the account");

console.log("closing when the market is closed");
const snap = await getMarkets();
const closedMkt = Object.values(snap.stats).find((s) => !s.open);
if (closedMkt) {
  await rejects(E.placeOrder(U, demo, { market: closedMkt.symbol, side: "buy", notional: 100 }), /closed right now/, `${closedMkt.symbol} is closed: new trades refused`);
  const k = await insertTicket(demo, closedMkt.symbol, 1, closedMkt.mark);
  const res = await E.closeTickets(U, demo, k);
  assert.ok(!res.account.positions.some((p) => p.id === k));
  ok(`${closedMkt.symbol} is closed but its open trade still closes (this was the reported bug)`);
} else {
  console.log("    (all markets open right now — skipped; runs when FX/gold are off-hours)");
}

console.log("TP / SL triggers");
const tps = E.insertAccount(db, U, "25000-classic-1", null);
const tpAcct = await tps;
const m2 = (await getMarkets()).stats["ETH-USD"].mark;
const tpId = await insertTicket(tpAcct, "ETH-USD", 1, m2 * 0.98, m2 * 0.99, null); // long, TP already below mark → hit
const slId = await insertTicket(tpAcct, "ETH-USD", 1, m2 * 1.05, null, m2 * 1.02); // long, SL above mark → gapped through
await E.getAccountView(U, tpAcct);
hist = await E.getTradeHistory(U, tpAcct);
const tpRow = hist.find((x) => x.ticketId === tpId);
const slRow = hist.find((x) => x.ticketId === slId);
assert.equal(tpRow.reason, "tp");
near(tpRow.exit, m2 * 0.99, 1e-6);
ok("TP fills at the TP price (limit-like)");
assert.equal(slRow.reason, "sl");
assert.ok(slRow.exit < m2 * 1.02, "gapped stop fills at market, not at the stale stop price");
ok("SL that gapped fills at the worse market price, not the stop");

console.log("rule enforcement");
const dd = await E.insertAccount(db, U, "25000-classic-1", null);
await setBal(25_000 - 1_500, 25_000 - 1_500, dd);
let v = await E.getAccountView(U, dd);
assert.equal(v.breachReason, "max_drawdown");
ok("static max drawdown breach");

const daily = await E.insertAccount(db, U, "25000-classic-1", null);
await setBal(25_400, 26_200, daily);
v = await E.getAccountView(U, daily);
assert.equal(v.breachReason, "daily_loss");
ok("daily loss breach (from day-start equity)");

const pass1 = await E.insertAccount(db, U, "25000-pro-1", null);
await setBal(28_000, 28_000, pass1);
assert.equal((await E.getAccountView(U, pass1)).status, "passed");
ok("1-step pass at target");

const two = await E.insertAccount(db, U, "50000-turbo-2", null);
await setBal(54_000, 54_000, two);
v = await E.getAccountView(U, two);
assert.equal(v.step, 2);
assert.equal(v.balance, 50_000);
assert.equal(v.rules.profitTarget, 0.05);
ok("2-step: phase 1 pass resets balance into phase 2 (5% target)");

const bw = await E.insertAccount(db, U, "10000-turbo-1", null);
await E.placeOrder(U, bw, { market: "ETH-USD", side: "buy", notional: 8_000 });
await E.placeOrder(U, bw, { market: "SOL-USD", side: "sell", notional: 6_000 });
await setBal(10_000 - 400, 10_000, bw);
v = await E.getAccountView(U, bw);
assert.equal(v.status, "breached");
assert.equal(v.positions.length, 0);
assert.equal((await E.getTradeHistory(U, bw)).filter((x) => x.reason === "breach").length, 2);
ok("breach force-closes every open trade");
await rejects(E.placeOrder(U, bw, { market: "ETH-USD", side: "buy", notional: 100 }), /breached/, "breached accounts can't trade");

console.log("concurrency");
const par = await E.insertAccount(db, U, "50000-classic-1", null);
const results = await Promise.all(Array.from({ length: 6 }, () => E.placeOrder(U, par, { market: "SOL-USD", side: "buy", notional: 1_000 })));
const final = await E.getAccountView(U, par);
assert.equal(final.positions.length, 6);
near(final.balance, 50_000 - results.reduce((s, x) => s + x.fill.fee, 0));
assert.equal(new Set(results.map((x) => x.fill.ticketId)).size, 6);
ok("6 parallel orders → 6 distinct trades, no lost balance updates");

const sweep = await E.riskSweep();
ok(`risk sweep checked ${sweep.checked} active accounts (stale=${sweep.stale})`);
console.log("\nALL ENGINE TESTS PASSED");
