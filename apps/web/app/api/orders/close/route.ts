import { closePosition } from "@/lib/server/engine";
import { authed, body } from "@/lib/server/http";

// POST /api/orders/close { accountId, market }
export const POST = authed(async ({ req, user }) => {
  const { accountId, market } = await body<{ accountId: string; market: string }>(req);
  return closePosition(user.id, String(accountId), String(market));
});
