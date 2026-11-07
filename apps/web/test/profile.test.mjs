// Profile stats must agree with the engine's own views (runs after engine.test.mjs on the same throwaway DB).
import { register } from "node:module";
import assert from "node:assert/strict";
register(new URL("./loader.mjs", import.meta.url));

const E = await import("@/lib/server/engine");
const { profileStats } = await import("@/lib/server/profile");
const ok = (n) => console.log("  ✓", n);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≉ ${b}`);

const U = "test-user";
const s = await profileStats(U);
const accounts = await E.listAccounts(U);
assert.equal(s.challenges.total, accounts.length);
assert.equal(s.challenges.active, accounts.filter((a) => a.status === "active").length);
assert.equal(s.challenges.breached, accounts.filter((a) => a.status === "breached").length);
assert.equal(s.challenges.demo, accounts.filter((a) => a.demo).length);
ok(`account counts match (${s.challenges.total} total, ${s.challenges.active} active, ${s.challenges.breached} breached)`);

const history = (await Promise.all(accounts.map((a) => E.getTradeHistory(U, a.id)))).flat();
assert.equal(s.trades.closed, history.length);
near(s.trades.netPnl, history.reduce((x, h) => x + h.net, 0));
assert.equal(s.trades.wins, history.filter((h) => h.net > 0).length);
ok(`trade stats match history (${s.trades.closed} closed, net ${s.trades.netPnl.toFixed(2)})`);

const empty = await profileStats("nobody");
assert.deepEqual(empty.challenges, { total: 0, paid: 0, demo: 0, active: 0, passed: 0, breached: 0 });
assert.equal(empty.trades.netPnl, 0);
ok("a user with no data gets zeros, not nulls");
console.log("\nALL PROFILE TESTS PASSED");
