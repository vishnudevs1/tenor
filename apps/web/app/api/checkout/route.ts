import { createOrder, type CartLine } from "@/lib/server/checkout";
import { authed, body } from "@/lib/server/http";

export const POST = authed(async ({ req, user }) => {
  const { lines, wallet } = await body<{ lines: CartLine[]; wallet: string }>(req);
  return createOrder(user.id, lines, String(wallet));
});
