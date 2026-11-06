import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFill, triggered, walkBook, walkBookQty } from "./execution.ts";

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const asks = [
  { price: 100, qty: 1 },
  { price: 101, qty: 2 },
];

test("walkBook fills across levels at VWAP", () => {
  const f = walkBook(asks, 302)!; // 100 + 202
  near(f.qty, 3);
  near(f.avgPrice, 302 / 3);
});

test("walkBook refuses orders larger than the book", () => {
  assert.equal(walkBook(asks, 1_000), null);
  assert.equal(walkBook(asks, 0), null);
});

test("walkBookQty prices a fixed quantity", () => {
  near(walkBookQty(asks, 1.5)!.notional, 100 + 50.5);
});

test("same-side fills average the entry", () => {
  const { pos, realized } = applyFill({ qty: 1, entry: 100 }, "buy", 1, 110);
  near(pos.qty, 2);
  near(pos.entry, 105);
  assert.equal(realized, 0);
});

test("partial close realizes PnL and keeps entry", () => {
  const { pos, realized } = applyFill({ qty: 2, entry: 100 }, "sell", 1, 110);
  near(realized, 10);
  near(pos.qty, 1);
  near(pos.entry, 100);
});

test("short PnL sign is correct", () => {
  near(applyFill({ qty: -1, entry: 100 }, "buy", 1, 90).realized, 10);
});

test("flip opens the remainder at the fill price", () => {
  const { pos, realized } = applyFill({ qty: 1, entry: 100 }, "sell", 3, 90);
  near(realized, -10);
  near(pos.qty, -2);
  near(pos.entry, 90);
});

test("TP/SL triggers", () => {
  assert.equal(triggered({ qty: 1, entry: 100, tp: 110, sl: 95 }, 94), "sl");
  assert.equal(triggered({ qty: 1, entry: 100, tp: 110, sl: 95 }, 111), "tp");
  assert.equal(triggered({ qty: -1, entry: 100, tp: 90, sl: 105 }, 106), "sl");
  assert.equal(triggered({ qty: -1, entry: 100, tp: 90, sl: 105 }, 100), null);
});
