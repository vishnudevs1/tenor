import type { Metadata } from "next";
import { listAccounts } from "@/lib/server/engine";
import { currentUser } from "@/lib/server/user";
import { DEFAULT_MARKET, MARKET_BY_SYMBOL } from "@/lib/markets";
import { TradeClient } from "./TradeClient";

export const metadata: Metadata = { title: "Trade — Tenor" };

export default async function TradePage({ searchParams }: { searchParams: Promise<{ account?: string; market?: string }> }) {
  const { account, market } = await searchParams;
  const user = (await currentUser())!;
  const accounts = await listAccounts(user.id);
  // Prefer the requested account, else the first active one, else the most recent.
  const selected = accounts.find((a) => a.id === account) ?? accounts.find((a) => a.status === "active") ?? accounts[0] ?? null;
  return <TradeClient accounts={accounts} initialAccountId={selected?.id ?? null} initialMarket={market && MARKET_BY_SYMBOL[market] ? market : DEFAULT_MARKET} />;
}
