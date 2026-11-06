import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProductId, priceOf, productId, rulesFor } from "./products.ts";

test("product ids round-trip", () => {
  const p = { size: 25_000, plan: "classic" as const, steps: 1 as const, demo: false };
  assert.deepEqual(parseProductId(productId(p)), p);
});

test("untrusted ids are rejected", () => {
  for (const bad of ["", "25000-classic", "123-classic-1", "25000-gold-1", "25000-classic-3", "demo-classic-1; drop"]) {
    assert.equal(parseProductId(bad), null, bad);
  }
});

test("prices follow the pricing engine", () => {
  assert.equal(priceOf(parseProductId("25000-classic-1")!), 180);
  assert.equal(priceOf(parseProductId("25000-turbo-1")!), 90);
  assert.equal(priceOf(parseProductId("demo-classic-1")!), 0);
  assert.ok(priceOf(parseProductId("25000-classic-2")!) < 180, "2-step is cheaper (lower pass rate)");
});

test("2-step uses phase targets", () => {
  const p = parseProductId("50000-pro-2")!;
  assert.equal(rulesFor(p, 1).profitTarget, 0.08);
  assert.equal(rulesFor(p, 2).profitTarget, 0.05);
  assert.equal(rulesFor(parseProductId("50000-pro-1")!).profitTarget, 0.12);
});
