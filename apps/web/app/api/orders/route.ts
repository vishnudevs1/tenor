import { placeOrder, type OrderInput } from "@/lib/server/engine";
import { authed, body } from "@/lib/server/http";

const optNum = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

// POST /api/orders { accountId, market, side, notional, reduceOnly?, tp?, sl? }
export const POST = authed(async ({ req, user }) => {
  const b = await body<Partial<OrderInput> & { accountId: string }>(req);
  return placeOrder(user.id, String(b.accountId), {
    market: String(b.market),
    side: b.side === "sell" ? "sell" : "buy",
    notional: Number(b.notional),
    reduceOnly: b.reduceOnly === true,
    tp: optNum(b.tp),
    sl: optNum(b.sl),
  });
});
