"use client";

import { useState } from "react";
import type { AccountView, FillRow } from "@/lib/server/engine";
import { MARKET_BY_SYMBOL, displayPair, formatPrice } from "@/lib/markets";
import { api } from "@/lib/client";
import { signedUsd, usd } from "@/lib/format";
import { cx } from "../ui";

const REASONS: Record<string, string> = { order: "Order", tp: "Take profit", sl: "Stop loss", breach: "Breach close", pass: "Target close" };

export function Positions({ account, fills, onChange }: { account: AccountView | null; fills: FillRow[]; onChange: (a: AccountView) => void }) {
  const [tab, setTab] = useState<"positions" | "history">("positions");
  const [closing, setClosing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const positions = account?.positions ?? [];

  async function close(market: string) {
    if (!account) return;
    setClosing(market);
    setError(null);
    try {
      const res = await api<{ account: AccountView }>("/api/orders/close", { body: { accountId: account.id, market } });
      onChange(res.account);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setClosing(null);
    }
  }

  return (
    <div>
      <div className="flex items-center border-b border-line text-sm">
        {(["positions", "history"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cx("px-4 py-2.5", tab === t ? "border-b-2 border-fg font-medium" : "text-muted hover:text-fg")}>
            {t === "positions" ? `Positions (${positions.length})` : "Trade history"}
          </button>
        ))}
        {error && <span role="alert" className="ml-auto pr-4 text-xs text-down">{error}</span>}
      </div>

      {tab === "positions" ? (
        positions.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">No open positions</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-xs">
              <thead className="text-left text-faint">
                <tr>
                  {["Market", "Size", "Value", "Entry", "Mark", "Unrealized P&L", "TP / SL", ""].map((h, i) => (
                    <th key={i} className={cx("px-4 py-2.5 font-normal", i > 0 && i < 7 && "text-right")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {positions.map((p) => {
                  const m = MARKET_BY_SYMBOL[p.market];
                  return (
                    <tr key={p.market}>
                      <td className="px-4 py-3">
                        <span className="font-medium">{m ? displayPair(m) : p.market}</span>{" "}
                        <span className={p.qty > 0 ? "text-up" : "text-down"}>{p.qty > 0 ? "Long" : "Short"}</span>
                      </td>
                      <td className="num px-4 py-3 text-right">{Math.abs(p.qty).toPrecision(4)} {m?.base}</td>
                      <td className="num px-4 py-3 text-right">{usd(p.notional, true)}</td>
                      <td className="num px-4 py-3 text-right">{m ? formatPrice(p.entry, m) : p.entry}</td>
                      <td className="num px-4 py-3 text-right">{m ? formatPrice(p.mark, m) : p.mark}</td>
                      <td className={cx("num px-4 py-3 text-right", p.upnl >= 0 ? "text-up" : "text-down")}>{signedUsd(p.upnl)}</td>
                      <td className="num px-4 py-3 text-right text-muted">
                        {p.tp && m ? formatPrice(p.tp, m) : "—"} / {p.sl && m ? formatPrice(p.sl, m) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => close(p.market)} disabled={closing !== null || account?.status !== "active"} className="rounded-full border border-line px-3 py-1 hover:border-line-strong disabled:opacity-40">
                          {closing === p.market ? "Closing…" : "Close"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : fills.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">No trades yet</p>
      ) : (
        <div className="max-h-72 overflow-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead className="sticky top-0 bg-surface text-left text-faint">
              <tr>
                {["Time", "Market", "Side", "Size", "Price", "Fee", "Realized P&L", "Type"].map((h, i) => (
                  <th key={h} className={cx("px-4 py-2.5 font-normal", i >= 3 && i <= 6 && "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {fills.map((f) => {
                const m = MARKET_BY_SYMBOL[f.market];
                return (
                  <tr key={f.id}>
                    <td className="num px-4 py-2.5 text-muted">{new Date(f.ts).toLocaleString("en-GB", { hour12: false })}</td>
                    <td className="px-4 py-2.5">{m ? displayPair(m) : f.market}</td>
                    <td className={cx("px-4 py-2.5", f.side === "buy" ? "text-up" : "text-down")}>{f.side === "buy" ? "Buy" : "Sell"}</td>
                    <td className="num px-4 py-2.5 text-right">{f.qty.toPrecision(4)}</td>
                    <td className="num px-4 py-2.5 text-right">{m ? formatPrice(f.price, m) : f.price}</td>
                    <td className="num px-4 py-2.5 text-right text-muted">{usd(f.fee, true)}</td>
                    <td className={cx("num px-4 py-2.5 text-right", f.realized_pnl > 0 ? "text-up" : f.realized_pnl < 0 ? "text-down" : "text-muted")}>
                      {f.realized_pnl === 0 ? "—" : signedUsd(f.realized_pnl)}
                    </td>
                    <td className="px-4 py-2.5 text-muted">{REASONS[f.reason] ?? f.reason}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
