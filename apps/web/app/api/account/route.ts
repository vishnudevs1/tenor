import { getAccountView, getTradeHistory } from "@/lib/server/engine";
import { authed } from "@/lib/server/http";

// GET /api/account?id=TN-… → marked-to-market account + closed trades (per-trade P&L)
export const GET = authed(async ({ req, user }) => {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const [account, history] = await Promise.all([getAccountView(user.id, id), getTradeHistory(user.id, id)]);
  return { account, history };
});
