import { confirmOrder } from "@/lib/server/checkout";
import { authed, body } from "@/lib/server/http";

// POST /api/checkout/confirm { orderId, txHash, signature }
export const POST = authed(async ({ req, user }) => {
  const { orderId, txHash, signature } = await body<{ orderId: string; txHash: string; signature: string }>(req);
  return confirmOrder(user.id, String(orderId), String(txHash), String(signature));
});
