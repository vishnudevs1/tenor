import { closeTickets } from "@/lib/server/engine";
import { authed, body } from "@/lib/server/http";

// POST /api/orders/close { accountId, ticketId, fraction? }
// ticketId "all" flattens the account. fraction in (0, 1] closes that share of each trade; default 1 = everything.
export const POST = authed(async ({ req, user }) => {
  const { accountId, ticketId, fraction } = await body<{ accountId: string; ticketId: number | "all"; fraction?: number }>(req);
  return closeTickets(user.id, String(accountId), ticketId === "all" ? "all" : Number(ticketId), fraction === undefined ? 1 : Number(fraction));
});
