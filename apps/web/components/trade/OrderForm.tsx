"use client";

import { useState } from "react";
import { TAKER_FEE } from "@tenor/rules";
import type { AccountView } from "@/lib/server/engine";
import { formatPrice, type Market, type MarketStats } from "@/lib/markets";
import { api } from "@/lib/client";
import { usd } from "@/lib/format";
import { ButtonLink, cx } from "../ui";

type Side = "buy" | "sell";

export function OrderForm({ account, market, stats, onPlaced }: { account: AccountView | null; market: Market; stats?: MarketStats; onPlaced: (a: AccountView) => void }) {
  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState("");
  const [reduceOnly, setReduceOnly] = useState(false);
  const [tpsl, setTpsl] = useState(false);
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "up" | "down"; text: string } | null>(null);

  const active = account?.status === "active";
  const mark = stats?.mark ?? 0;
  const position = account?.positions.find((p) => p.market === market.symbol);
  const equity = account?.equity ?? 0;
  const sameDir = position && (side === "buy" ? position.qty > 0 : position.qty < 0);
  const maxNotional = Math.max(0, equity * market.maxLeverage - (sameDir ? position.notional : 0));
  const notional = Number(amount) || 0;
  const fee = notional * TAKER_FEE;
  const usedPct = maxNotional > 0 ? Math.min(100, Math.round((notional / maxNotional) * 100)) : 0;

  // Estimated breach price for the resulting position: where equity would hit the nearest loss limit.
  let breach: number | null = null;
  if (account && active && mark > 0 && notional > 0 && !reduceOnly) {
    const q = (position?.qty ?? 0) + (side === "buy" ? 1 : -1) * (notional / mark);
    const room = Math.min(account.objectives.dailyLoss.remaining, account.objectives.drawdown.remaining) - fee;
    if (Math.abs(q) > 1e-12) breach = q > 0 ? mark - room / q : mark + room / Math.abs(q);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!account) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await api<{ account: AccountView; fill: { qty: number; price: number } }>("/api/orders", {
        body: { accountId: account.id, market: market.symbol, side, notional, reduceOnly, tp: tpsl ? tp : null, sl: tpsl ? sl : null },
      });
      onPlaced(res.account);
      setAmount("");
      setMsg({ tone: "up", text: `${side === "buy" ? "Bought" : "Sold"} ${res.fill.qty.toPrecision(4)} ${market.base} @ ${formatPrice(res.fill.price, market)}` });
    } catch (err) {
      setMsg({ tone: "down", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const field = "num h-10 w-full rounded-xl border border-line bg-bg px-3 text-sm outline-none focus:border-accent";

  return (
    <form onSubmit={submit} className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-bg p-1">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSide(s)}
            aria-pressed={side === s}
            className={cx("h-9 rounded-lg text-sm font-medium transition-colors", side === s ? (s === "buy" ? "bg-up/20 text-up" : "bg-down/20 text-down") : "text-muted hover:text-fg")}
          >
            {s === "buy" ? "Buy / Long" : "Sell / Short"}
          </button>
        ))}
      </div>

      <div>
        <label htmlFor="amount" className="flex justify-between text-xs text-muted">
          <span>Size (USD)</span>
          <span>Market order · up to {market.maxLeverage}×</span>
        </label>
        <div className="relative mt-1.5">
          <input id="amount" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} disabled={!active} className={cx(field, "h-12 pr-16 text-lg")} />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">USDC</span>
        </div>
        <div className="mt-1.5 text-xs text-faint num">≈ {mark > 0 && notional > 0 ? (notional / mark).toPrecision(4) : "0"} {market.base}</div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={usedPct}
          disabled={!active || maxNotional <= 0}
          onChange={(e) => setAmount(String(Math.floor((maxNotional * Number(e.target.value)) / 100)))}
          aria-label="Size as percent of max"
          className="mt-3 w-full accent-[var(--color-accent)]"
        />
        <div className="mt-1 flex justify-between text-[11px] text-faint">
          {[0, 25, 50, 75, 100].map((p) => (
            <button key={p} type="button" disabled={!active} onClick={() => setAmount(String(Math.floor((maxNotional * p) / 100)))} className="hover:text-fg">
              {p}%
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2.5">
          <input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)} disabled={!active} className="size-4 accent-[var(--color-accent)]" />
          Reduce only
        </label>
        <label className="flex items-center gap-2.5">
          <input type="checkbox" checked={tpsl} onChange={(e) => setTpsl(e.target.checked)} disabled={!active || reduceOnly} className="size-4 accent-[var(--color-accent)]" />
          Take profit / Stop loss
        </label>
        {tpsl && !reduceOnly && (
          <div className="grid grid-cols-2 gap-2">
            <input aria-label="Take profit price" placeholder="TP price" inputMode="decimal" value={tp} onChange={(e) => setTp(e.target.value.replace(/[^\d.]/g, ""))} className={field} />
            <input aria-label="Stop loss price" placeholder="SL price" inputMode="decimal" value={sl} onChange={(e) => setSl(e.target.value.replace(/[^\d.]/g, ""))} className={field} />
          </div>
        )}
      </div>

      {account ? (
        <button
          type="submit"
          disabled={!active || busy || notional <= 0 || !stats?.open}
          className={cx("h-11 w-full rounded-full text-sm font-semibold transition-opacity disabled:opacity-40", side === "buy" ? "bg-up text-bg" : "bg-down text-bg")}
        >
          {!active ? "Account is not active" : !stats?.open ? "Market closed" : busy ? "Placing…" : `${side === "buy" ? "Buy / Long" : "Sell / Short"} ${market.base}`}
        </button>
      ) : (
        <ButtonLink href="/challenges" className="w-full">Buy a challenge to trade</ButtonLink>
      )}
      <p role="status" className={cx("min-h-4 text-xs", msg?.tone === "up" ? "text-up" : "text-down")}>{msg?.text}</p>

      <dl className="space-y-1.5 border-t border-line pt-3 text-xs">
        {[
          ["Available to trade", account ? usd(maxNotional) : "—"],
          ["Current position", position ? `${position.qty > 0 ? "+" : ""}${position.qty.toPrecision(4)} ${market.base}` : `0 ${market.base}`],
          ["Est. fee", notional > 0 ? usd(fee, true) : "—"],
          ["Est. breach price", breach && breach > 0 ? formatPrice(breach, market) : "—"],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <dt className="text-muted">{k}</dt>
            <dd className="num">{v}</dd>
          </div>
        ))}
      </dl>
    </form>
  );
}
