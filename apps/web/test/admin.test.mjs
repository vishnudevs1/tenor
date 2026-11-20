// Admin users list: sign-ins are recorded once per session and the per-user totals agree with the engine.
// Runs after the engine/checkout tests on the same throwaway DB.
import { register } from "node:module";
import assert from "node:assert/strict";
register(new URL("./loader.mjs", import.meta.url));

const { db } = await import("@/lib/server/db");

const A = await import("@/lib/server/admin");
const E = await import("@/lib/server/engine");
const ok = (n) => console.log("  ✓", n);

const U = "test-user";
const t0 = Date.now() - 60_000;
await A.recordLogin(U, t0);
await A.recordLogin(U, t0); // same session seen again: no duplicate
await A.recordLogin(U, t0 + 1000);
const users = await A.listUsers();
const me = users.find((u) => u.id === U);
assert.ok(me, "test user is listed");
assert.equal(me.logins, 2);
assert.equal(me.lastLoginAt, t0 + 1000);
ok("sign-ins are recorded once per session");

const accounts = await E.listAccounts(U);
assert.equal(me.challenges, accounts.length);
assert.equal(me.activeChallenges, accounts.filter((a) => a.status === "active").length);
ok(`per-user challenge counts match the engine (${me.challenges})`);

const o = await A.adminOverview();
assert.equal(o.users, Number((await db.one("SELECT COUNT(*) AS c FROM users")).c));
assert.ok(o.logins7d >= 2);
assert.equal((await A.recentLogins(1))[0].ts, t0 + 1000);
ok(`overview totals (${o.users} users, ${o.logins7d} sign-ins this week)`);

process.env.ADMIN_EMAILS = " Boss@Example.com , ops@example.com";
assert.equal(A.isAdmin("boss@example.com"), true);
assert.equal(A.isAdmin("t@example.com"), false);
assert.equal(A.isAdmin(null), false);
delete process.env.ADMIN_EMAILS;
assert.equal(A.isAdmin("boss@example.com"), false);
ok("admin access is limited to ADMIN_EMAILS");
console.log("\nALL ADMIN TESTS PASSED");

// Legacy duplicates: the same Google email under random per-sign-in ids gets merged onto the stable id.
{
  const email = "dup@example.com";
  const L1 = "7f3a1c2e-0b4d-4e5f-8a9b-1c2d3e4f5a6b", L2 = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"; // old random ids
  const G = "104857600000000000001", OTHER = "104857600000000000002"; // Google subject ids
  const now = Date.now();
  for (const [id, at] of [[L1, now - 9e6], [L2, now - 5e6], [G, now], [OTHER, now - 1e6]]) {
    await db.run("INSERT INTO users (id, email, name, created_at) VALUES ($1, $2, 'Dup', $3)", [id, email, at]);
  }
  const demo = (id, user, at) =>
    db.run(
      `INSERT INTO accounts (id, user_id, product_id, size, demo, status, balance, day_key, day_start_equity, created_at)
       VALUES ($1, $2, 'p', 10000, $3, 'active', 10000, 'x', 10000, $4)`,
      [id, user, id.startsWith("paid") ? 0 : 1, at],
    );
  await demo("demo-old", L1, now - 9e6);
  await demo("demo-new", G, now);
  await demo("paid-1", L2, now - 5e6);
  await A.recordLogin(L2, now - 5e6);

  assert.equal(await A.claimLegacyUsers(G, "DUP@example.com"), 2);
  const rows = await db.all("SELECT id, created_at FROM users WHERE email = $1 ORDER BY id", [email]);
  assert.deepEqual(rows.map((r) => r.id), [G, OTHER], "another real Google account is never absorbed");
  assert.equal(Number(rows[0].created_at), now - 9e6);
  const accts = await db.all("SELECT id, status FROM accounts WHERE user_id = $1 ORDER BY id", [G]);
  assert.deepEqual(accts.map((a) => [a.id, a.status]), [["demo-new", "breached"], ["demo-old", "active"], ["paid-1", "active"]]);
  assert.equal((await A.listUsers()).find((u) => u.id === G).logins, 1);
  assert.equal(await A.claimLegacyUsers(G, email), 0);
  ok("duplicate sign-in identities merge onto the stable Google id (oldest demo kept, paid kept, real Google ids untouched)");
}
console.log("ALL MERGE TESTS PASSED");
