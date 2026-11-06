// End-to-end engine test against LIVE Extended market data, on a throwaway DB.
// Run: npm run test:engine (uses a throwaway DB in .data-test/)
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
register(new URL("./loader.mjs", import.meta.url));

const { db } = await import("@/lib/server/db");
const E = await import("@/lib/server/engine");

const U = "test-user";
await db.run("INSERT INTO users (id, email, name, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING", [U, "t@example.com", "Tester", Date.now()]);
const ok = (name) => console.log("  ✓", name);
const rejects = async (p, re, name) => {
  await assert.rejects(p, (e) => (re.test(e.message) ? true : (console.log("    got:", e.message), false)));
  ok(name);
};

console.log("demo account + market orders (live BTC book)");
const demo = await E.createDemoAccount(U, "demo-classic-1");
await rejects(E.createDemoAccount(U, "demo-classic-1"), /already have an active demo/, "only one active demo");

let r = await E.placeOrder(U, demo, { market: "BTC-USD", side: "buy", notional: 20_000 });
console.log(`    filled ${r.fill.qty.toFixed(5)} BTC @ ${r.fill.price.toFixed(2)}, fee $${r.fill.fee.toFixed(2)}`);
assert.equal(r.account.positions.length, 1);
assert.ok(Math.abs(r.account.balance - (10_000 - r.fill.fee)) < 1e-6, "balance = start − fee");
ok("buy fills against real book, fee charged");

await rejects(E.placeOrder(U, demo, { market: "BTC-USD", side: "buy", notional: 40_000 }), /Max leverage/, "5× leverage cap enforced");
await rejects(E.placeOrder(U, demo, { market: "BTC-USD", side: "buy", notional: 5 }), /Minimum order/, "minimum order size");
await rejects(E.placeOrder(U, demo, { market: "BTC-USD", side: "buy", notional: 100, reduceOnly: true }), /Reduce-only/, "reduce-only can't increase");
await rejects(E.placeOrder(U, demo, { market: "BTC-USD", side: "buy", notional: 100, tp: 1 }), /Take profit/, "TP on wrong side rejected");

r = await E.placeOrder(U, demo, { market: "BTC-USD", side: "sell", notional: 8_000, reduceOnly: true });
assert.ok(r.account.positions[0].qty > 0 && r.fill.realized !== 0);
ok(`partial reduce realizes PnL (${r.fill.realized.toFixed(2)})`);

r = await E.closePosition(U, demo, "BTC-USD");
assert.equal(r.account.positions.length, 0);
ok(`close flattens; balance now $${r.account.balance.toFixed(2)}`);

await E.placeOrder(U, demo, { market: "EUR-USD", side: "sell", notional: 30_000 });
const fills = await E.getFills(U, demo);
assert.ok(fills.length >= 4);
ok(`FX short opened; ${fills.length} fills recorded`);
await rejects(E.getAccountView("someone-else", demo), /not found/, "other users can't read the account");

console.log("rule enforcement");
const set = { run: (bal, day, id) => db.run("UPDATE accounts SET balance = $1, day_start_equity = $2 WHERE id = $3", [bal, day, id]) };

const dd = await E.insertAccount(db, U, "25000-classic-1", null);
await set.run(25_000 - 1_500, 25_000 - 1_500, dd); // 6% DD on 25K = 1,500 → at the limit
let v = await E.getAccountView(U, dd);
assert.equal(v.status, "breached");
assert.equal(v.breachReason, "max_drawdown");
ok("static max drawdown breach");

const daily = await E.insertAccount(db, U, "25000-classic-1", null);
await set.run(25_400, 26_200, daily); // lost 800 today > 3% × 25K = 750
v = await E.getAccountView(U, daily);
assert.equal(v.breachReason, "daily_loss");
ok("daily loss breach (from day-start equity)");

const pass1 = await E.insertAccount(db, U, "25000-pro-1", null);
await set.run(28_000, 28_000, pass1); // +12% target = 3,000
v = await E.getAccountView(U, pass1);
assert.equal(v.status, "passed");
ok("1-step pass at target");

const two = await E.insertAccount(db, U, "50000-turbo-2", null);
await set.run(54_000, 54_000, two); // phase 1 target 8%
v = await E.getAccountView(U, two);
assert.equal(v.status, "active");
assert.equal(v.step, 2);
assert.equal(v.balance, 50_000);
assert.equal(v.rules.profitTarget, 0.05);
ok("2-step: phase 1 pass resets balance into phase 2 (5% target)");

const breachWithPos = await E.insertAccount(db, U, "10000-turbo-1", null);
await E.placeOrder(U, breachWithPos, { market: "ETH-USD", side: "buy", notional: 20_000 });
await set.run(10_000 - 400, 10_000, breachWithPos); // push into the 3% DD
v = await E.getAccountView(U, breachWithPos);
assert.equal(v.status, "breached");
assert.equal(v.positions.length, 0);
assert.ok((await E.getFills(U, breachWithPos)).some((f) => f.reason === "breach"));
ok("breach force-closes open positions");

await rejects(E.placeOrder(U, breachWithPos, { market: "ETH-USD", side: "buy", notional: 100 }), /breached/, "breached accounts can't trade");

console.log("concurrency");
const par = await E.insertAccount(db, U, "50000-classic-1", null);
const results = await Promise.all(Array.from({ length: 6 }, () => E.placeOrder(U, par, { market: "SOL-USD", side: "buy", notional: 1_000 })));
const parFills = await E.getFills(U, par);
const feeSum = parFills.reduce((s, f) => s + f.fee, 0);
const final = await E.getAccountView(U, par);
assert.equal(parFills.length, 6);
assert.ok(Math.abs(final.balance - (50_000 - feeSum)) < 1e-6, "no lost updates on balance");
assert.ok(Math.abs(final.positions[0].qty - results.reduce((s, r) => s + r.fill.qty, 0)) < 1e-9, "position = sum of fills");
ok("6 parallel orders: no lost updates (row lock holds)");

const sweep = await E.riskSweep();
ok(`risk sweep checked ${sweep.checked} active accounts (stale=${sweep.stale})`);
console.log("\nALL ENGINE TESTS PASSED");
