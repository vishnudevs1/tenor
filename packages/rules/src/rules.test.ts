import { test } from "node:test";
import assert from "node:assert/strict";
import { minFee, coverageRatio, maxLoss } from "./pricing.ts";
import { evaluate, CLASSIC } from "./rules.ts";

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.01, `${a} ≉ ${b}`);

test("minFee matches blueprint §4.2 table (25K, 6% DD, 1.25× buffer)", () => {
  near(minFee({ accountSize: 25_000, maxDrawdown: 0.06, passRate: 0.05, coverage: 1 }), 93.75);
  near(minFee({ accountSize: 25_000, maxDrawdown: 0.06, passRate: 0.08, coverage: 1 }), 150);
  near(minFee({ accountSize: 25_000, maxDrawdown: 0.06, passRate: 0.08 }), 180);
  near(minFee({ accountSize: 25_000, maxDrawdown: 0.06, passRate: 0.15 }), 337.5);
});

test("coverage ratio is 1.0 exactly at the solvency line", () => {
  const input = { accountSize: 25_000, maxDrawdown: 0.06, passRate: 0.08 };
  near(coverageRatio(150, input), 1);
  assert.ok(coverageRatio(160, { ...input, passRate: 0.12 }) < 1, "bear case is under the line");
});

test("maxLoss includes gap buffer", () => near(maxLoss(25_000, 0.06), 1875));

const base = { phase: "evaluation" as const, initialBalance: 25_000, dayStartEquity: 25_000 };

test("active account reports progress", () => {
  const r = evaluate({ ...base, equity: 26_250 }, CLASSIC);
  assert.equal(r.status, "active");
  near(r.profit.progress, 0.5);
});

test("hitting the target passes an evaluation", () => {
  assert.equal(evaluate({ ...base, equity: 27_500 }, CLASSIC).status, "passed");
});

test("funded accounts never 'pass'", () => {
  assert.equal(evaluate({ ...base, phase: "funded", equity: 30_000 }, CLASSIC).status, "active");
});

test("daily loss breach", () => {
  const r = evaluate({ ...base, dayStartEquity: 26_000, equity: 25_250 }, CLASSIC);
  assert.equal(r.status, "breached");
  assert.equal(r.reason, "daily_loss");
});

test("static max drawdown breach", () => {
  const r = evaluate({ ...base, dayStartEquity: 23_600, equity: 23_500 }, CLASSIC);
  assert.equal(r.reason, "max_drawdown");
});
