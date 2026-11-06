import { getAccountView, getFills } from "@/lib/server/engine";
import { authed } from "@/lib/server/http";

// GET /api/account?id=TN-… → marked-to-market account + fill history
export const GET = authed(async ({ req, user }) => {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  return { account: await getAccountView(user.id, id), fills: await getFills(user.id, id) };
});
