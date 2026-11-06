import { updateTicket } from "@/lib/server/engine";
import { authed, body } from "@/lib/server/http";

const optNum = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

// POST /api/orders/update { accountId, ticketId, tp, sl } — null clears a level
export const POST = authed(async ({ req, user }) => {
  const b = await body<{ accountId: string; ticketId: number; tp?: number | null; sl?: number | null }>(req);
  return updateTicket(user.id, String(b.accountId), Number(b.ticketId), optNum(b.tp), optNum(b.sl));
});
