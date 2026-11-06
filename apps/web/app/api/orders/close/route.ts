import { closeTickets } from "@/lib/server/engine";
import { authed, body } from "@/lib/server/http";

// POST /api/orders/close { accountId, ticketId } — or ticketId: "all" to flatten the account
export const POST = authed(async ({ req, user }) => {
  const { accountId, ticketId } = await body<{ accountId: string; ticketId: number | "all" }>(req);
  return closeTickets(user.id, String(accountId), ticketId === "all" ? "all" : Number(ticketId));
});
